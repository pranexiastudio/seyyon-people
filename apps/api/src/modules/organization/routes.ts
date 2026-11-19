import { Router, type Response } from "express";
import { z } from "zod";
import {
  branchSchema, catalogQuery, catalogStatusQuery, departmentSchema, designationSchema,
  jobGradeSchema, organizationPermissions, workLocationKinds, workLocationSchema,
  type AuthProfile, type CatalogRow,
} from "@seyyon/shared";
import type { Prisma } from "../../generated/prisma/client.js";
import { writeTenantAudit } from "../../lib/audit.js";
import { lockTenant, withTenant } from "../../lib/tenant.js";
import { HttpError } from "../../middleware/errors.js";

type Tx = Prisma.TransactionClient;
type Scope = { tx: Tx; tenantId: string };
type Query = z.infer<typeof catalogStatusQuery>;
type CatalogInput = { name: string; code: string };
type Write<T> = Scope & {
  id: string | null;
  input: T;
  active: boolean;
  current: CatalogRow | null;
  audit: (action: string, entityId: string) => Promise<unknown>;
};

const identity = { id: true, name: true, code: true } as const;
const summary = { ...identity, active: true } as const;
const branch = { ...summary, address: true, contactEmail: true, contactPhone: true, isPrimary: true } as const;
const department = { ...summary, description: true } as const;
const designation = { ...summary, departmentId: true, jobLevel: true, department: { select: identity } } as const;
const grade = { ...summary, rank: true, description: true } as const;
const location = { ...summary, kind: true, address: true, branchId: true, branch: { select: identity } } as const;
const alphabetical = [{ name: "asc" }, { id: "asc" }] as const;
const notFound = () => new HttpError(404, "NOT_FOUND", "Organization record not found.");
const inactiveReference = (entity: string) => new HttpError(409, "INACTIVE_REFERENCE", "Choose an active " + entity + ".");
const inUse = (message: string) => new HttpError(409, "ORGANIZATION_RECORD_IN_USE", message);

export const organizationRouter = Router();

function scope<T>(response: Response, writing: boolean, operation: (context: Scope) => Promise<T>) {
  const profile: AuthProfile = response.locals.profile;
  const tenantId = profile.tenantId;
  if (profile.platform || !tenantId) throw new HttpError(403, "FORBIDDEN", "Company workspace required.");
  return withTenant(profile.user.id, tenantId, writing ? organizationPermissions.manage : organizationPermissions.read, async (tx) => {
    if (writing) {
      await lockTenant(tx, tenantId);
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
      if (tenant?.status !== "ACTIVE") throw new HttpError(403, "TENANT_ACCESS_DENIED", "Company access denied.");
    }
    return operation({ tx, tenantId });
  });
}

function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const prefix = issue?.path.length ? issue.path.join(".") + " — " : "";
  throw new HttpError(400, "INVALID_ORGANIZATION_INPUT", prefix + (issue?.message ?? "Check the supplied values."));
}

function listing(tenantId: string, query: Query) {
  const literal = query.search.replace(/[\\%_]/g, "\\$&");
  const contains = { contains: literal, mode: "insensitive" as const };
  return {
    where: { tenantId, active: query.status === undefined ? undefined : query.status === "active",
      OR: query.search ? [{ name: contains }, { code: contains }] : undefined },
    window: { skip: (query.page - 1) * query.limit, take: query.limit },
  };
}

type Reader<Q extends Query> = {
  query: z.ZodType<Q>;
  list: (context: Scope, query: Q) => Promise<{ items: CatalogRow[]; total: number }>;
  get: (context: Scope, id: string) => Promise<CatalogRow | null>;
};
type Writer<T> = {
  create: z.ZodType<T>;
  patch: z.ZodType<Partial<T> & { active?: boolean }>;
  fields: readonly string[];
  save: (context: Write<T>) => Promise<CatalogRow>;
};

function register<Q extends Query, T extends CatalogInput>(
  path: string, action: string, reader: Reader<Q>, writer?: Writer<T>,
) {
  organizationRouter.get(path, async (request, response) => {
    const query = parse(reader.query, request.query);
    const result = await scope(response, false, (context) => reader.list(context, query));
    response.json({ ...result, page: query.page, limit: query.limit });
  });
  organizationRouter.get(path + "/:id", async (request, response) => {
    const id = parse(z.uuid(), request.params.id);
    const item = await scope(response, false, (context) => reader.get(context, id));
    if (!item) throw notFound();
    response.json(item);
  });
  if (!writer) return;
  const { create, patch, fields, save: persist } = writer;

  async function save(response: Response, id: string | null, body: unknown) {
    const changes = id ? parse(patch, body) : parse(create, body);
    try {
      return await scope(response, true, async ({ tx, tenantId }) => {
        const current = id ? await reader.get({ tx, tenantId }, id) : null;
        if (id && !current) throw notFound();
        const active = "active" in changes && typeof changes.active === "boolean" ? changes.active : current?.active ?? true;
        const input = parse(create, Object.fromEntries(fields.map((key) => [
          key, Object.hasOwn(changes, key) ? Reflect.get(changes, key) : current ? Reflect.get(current, key) : undefined,
        ])));
        if (current && active === current.active && fields.every((key) => Reflect.get(current, key) === Reflect.get(input, key))) {
          return current;
        }
        const audit = (event: string, entityId: string) => writeTenantAudit(tx, {
          tenantId, actorId: response.locals.profile.user.id, requestId: response.locals.requestId, entityId, action: event,
        });
        const result = await persist({ tx, tenantId, id, current, input, active, audit });
        const type = !current ? "CREATED" : active !== current.active ? active ? "REACTIVATED" : "DEACTIVATED" : "UPDATED";
        await audit(action + "_" + type, result.id);
        if (result.isPrimary !== undefined && !!current?.isPrimary !== result.isPrimary) {
          await audit(result.isPrimary ? "BRANCH_PRIMARY_SET" : "BRANCH_PRIMARY_CLEARED", result.id);
        }
        return result;
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        const target = "meta" in error && JSON.stringify(error.meta)?.includes("rank");
        throw new HttpError(409, target ? "DUPLICATE_GRADE_RANK" : "DUPLICATE_ORGANIZATION_CODE",
          target ? "This grade rank is already in use." : "This code is already in use.");
      }
      if (error && typeof error === "object" && "code" in error && error.code === "P2003") {
        throw inUse("This change would invalidate an existing organization assignment.");
      }
      throw error;
    }
  }

  organizationRouter.post(path, async (request, response) => response.status(201).json(await save(response, null, request.body)));
  organizationRouter.patch(path + "/:id", async (request, response) =>
    response.json(await save(response, parse(z.uuid(), request.params.id), request.body)));
}

const patchStatus = { active: z.boolean().optional() };
const changed = (value: object) => Object.keys(value).length > 0;

register("/branches", "BRANCH", {
  query: catalogStatusQuery,
  async list({ tx, tenantId }, query) {
    const { where, window } = listing(tenantId, query);
    const items = await tx.branch.findMany({ where, ...window, orderBy: [{ isPrimary: "desc" }, ...alphabetical], select: branch });
    return { items, total: await tx.branch.count({ where }) };
  },
  get: ({ tx, tenantId }, id) => tx.branch.findUnique({ where: { tenantId_id: { tenantId, id } }, select: branch }),
}, {
  create: branchSchema,
  patch: branchSchema.partial().extend(patchStatus).refine(changed, "Supply at least one change."),
  fields: Object.keys(branchSchema.shape),
  async save({ tx, tenantId, id, input, active, current, audit }) {
    if (!active) {
      if (input.isPrimary) throw inUse("Set another primary branch or clear the primary designation before deactivating this branch.");
      if (id && (await tx.workLocation.findFirst({ where: { tenantId, branchId: id, active: true }, select: identity }) ||
        await tx.employee.findFirst({ where: { tenantId, branchId: id, active: true }, select: { id: true } }))) {
        throw inUse("Reassign active work locations and employees before deactivating this branch.");
      }
    }
    if (input.isPrimary && !current?.isPrimary) {
      const previous = await tx.branch.findFirst({ where: { tenantId, isPrimary: true }, select: { id: true } });
      if (previous) {
        await tx.branch.update({ where: { tenantId_id: { tenantId, id: previous.id } }, data: { isPrimary: false } });
        await audit("BRANCH_PRIMARY_CLEARED", previous.id);
      }
    }
    return id ? tx.branch.update({ where: { tenantId_id: { tenantId, id } }, data: { ...input, active }, select: branch })
      : tx.branch.create({ data: { ...input, tenantId }, select: branch });
  },
});

register("/departments", "DEPARTMENT", {
  query: catalogStatusQuery,
  async list({ tx, tenantId }, query) {
    const { where, window } = listing(tenantId, query);
    const items = await tx.department.findMany({ where, ...window, orderBy: [...alphabetical], select: department });
    return { items, total: await tx.department.count({ where }) };
  },
  get: ({ tx, tenantId }, id) => tx.department.findUnique({ where: { tenantId_id: { tenantId, id } }, select: department }),
}, {
  create: departmentSchema,
  patch: departmentSchema.partial().extend(patchStatus).refine(changed, "Supply at least one change."),
  fields: Object.keys(departmentSchema.shape),
  async save({ tx, tenantId, id, input, active }) {
    if (id && !active) {
      const referenced = await tx.department.findFirst({ where: { tenantId, OR: [
        { id, headId: { not: null } }, { parentId: id, active: true },
      ] }, select: { id: true } });
      if (referenced || await tx.designation.findFirst({ where: { tenantId, departmentId: id, active: true }, select: identity }) ||
        await tx.employee.findFirst({ where: { tenantId, departmentId: id, active: true }, select: { id: true } })) {
        throw inUse("Reassign the department head, active child departments, designations and employees before deactivating.");
      }
    }
    if (id && active && await tx.department.findFirst({ where: { tenantId, id, parent: { is: { active: false } } }, select: { id: true } })) {
      throw inactiveReference("parent department");
    }
    return id ? tx.department.update({ where: { tenantId_id: { tenantId, id } }, data: { ...input, active }, select: department })
      : tx.department.create({ data: { ...input, tenantId }, select: department });
  },
});

register("/designations", "DESIGNATION", {
  query: catalogStatusQuery.extend({ departmentId: z.uuid().optional() }),
  async list({ tx, tenantId }, query) {
    const { where: base, window } = listing(tenantId, query);
    const where = { ...base, departmentId: query.departmentId };
    const items = await tx.designation.findMany({ where, ...window, orderBy: [...alphabetical], select: designation });
    return { items, total: await tx.designation.count({ where }) };
  },
  get: ({ tx, tenantId }, id) => tx.designation.findUnique({ where: { tenantId_id: { tenantId, id } }, select: designation }),
}, {
  create: designationSchema,
  patch: designationSchema.partial().extend(patchStatus).refine(changed, "Supply at least one change."),
  fields: Object.keys(designationSchema.shape),
  async save({ tx, tenantId, id, input, active, current }) {
    const target = await tx.department.findUnique({ where: { tenantId_id: { tenantId, id: input.departmentId } }, select: { active: true } });
    if (!target) throw notFound();
    if (!target.active && (active || input.departmentId !== current?.departmentId)) throw inactiveReference("department");
    if (id && !active && await tx.employee.findFirst({ where: { tenantId, designationId: id, active: true }, select: { id: true } })) {
      throw inUse("Reassign active employees before deactivating this designation.");
    }
    return id ? tx.designation.update({ where: { tenantId_id: { tenantId, id } }, data: { ...input, active }, select: designation })
      : tx.designation.create({ data: { ...input, tenantId }, select: designation });
  },
});

register("/job-grades", "JOB_GRADE", {
  query: catalogStatusQuery,
  async list({ tx, tenantId }, query) {
    const { where, window } = listing(tenantId, query);
    const items = await tx.jobGrade.findMany({ where, ...window, orderBy: [{ rank: "asc" }, { id: "asc" }], select: grade });
    return { items, total: await tx.jobGrade.count({ where }) };
  },
  get: ({ tx, tenantId }, id) => tx.jobGrade.findUnique({ where: { tenantId_id: { tenantId, id } }, select: grade }),
}, {
  create: jobGradeSchema,
  patch: jobGradeSchema.partial().extend(patchStatus).refine(changed, "Supply at least one change."),
  fields: Object.keys(jobGradeSchema.shape),
  async save({ tx, tenantId, id, input, active }) {
    if (id && !active && await tx.employee.findFirst({ where: { tenantId, jobGradeId: id, active: true }, select: { id: true } })) {
      throw inUse("Reassign active employees before deactivating this job grade.");
    }
    return id ? tx.jobGrade.update({ where: { tenantId_id: { tenantId, id } }, data: { ...input, active }, select: grade })
      : tx.jobGrade.create({ data: { ...input, tenantId }, select: grade });
  },
});

register("/employment-types", "EMPLOYMENT_TYPE", {
  query: catalogQuery,
  async list({ tx, tenantId }, query) {
    const { where: { OR }, window } = listing(tenantId, query);
    const where = { tenantId, OR };
    const items = await tx.employmentType.findMany({ where, ...window, orderBy: [...alphabetical], select: identity });
    return { items, total: await tx.employmentType.count({ where }) };
  },
  get: ({ tx, tenantId }, id) => tx.employmentType.findUnique({ where: { tenantId_id: { tenantId, id } }, select: identity }),
});

register("/work-locations", "WORK_LOCATION", {
  query: catalogStatusQuery.extend({ kind: z.enum(workLocationKinds).optional() }),
  async list({ tx, tenantId }, query) {
    const { where: base, window } = listing(tenantId, query);
    const where = { ...base, kind: query.kind };
    const items = await tx.workLocation.findMany({ where, ...window, orderBy: [...alphabetical], select: location });
    return { items, total: await tx.workLocation.count({ where }) };
  },
  get: ({ tx, tenantId }, id) => tx.workLocation.findUnique({ where: { tenantId_id: { tenantId, id } }, select: location }),
}, {
  create: workLocationSchema,
  patch: workLocationSchema.partial().extend(patchStatus).refine(changed, "Supply at least one change."),
  fields: Object.keys(workLocationSchema.shape),
  async save({ tx, tenantId, id, input, active, current }) {
    if (input.branchId) {
      const target = await tx.branch.findUnique({ where: { tenantId_id: { tenantId, id: input.branchId } }, select: { active: true } });
      if (!target) throw notFound();
      if (!target.active && (active || input.branchId !== current?.branchId)) throw inactiveReference("branch");
    }
    if (id && !active && await tx.employee.findFirst({ where: { tenantId, workLocationId: id, active: true }, select: { id: true } })) {
      throw inUse("Reassign active employees before deactivating this work location.");
    }
    return id ? tx.workLocation.update({ where: { tenantId_id: { tenantId, id } }, data: { ...input, active }, select: location })
      : tx.workLocation.create({ data: { ...input, tenantId }, select: location });
  },
});
