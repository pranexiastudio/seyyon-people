import { Router, type Response } from "express";
import { z } from "zod";
import {
  directReportsQuery, employeeCreateSchema, employeeListQuery, employeeManagerSchema, employeePermissions,
  employeeStatusSchema, employeeUpdateSchema,
  type AuthProfile, type EmployeeCreateInput, type EmployeeListQuery,
} from "@seyyon/shared";
import type { EmploymentStatus, Prisma } from "../../generated/prisma/client.js";
import { writeTenantAudit } from "../../lib/audit.js";
import { lockTenant, withTenant } from "../../lib/tenant.js";
import { HttpError } from "../../middleware/errors.js";

type Tx = Prisma.TransactionClient;
const catalogSummary = { id: true, code: true, name: true } as const;
const directoryFields = {
  id: true, employeeNumber: true, displayName: true, firstName: true, lastName: true,
  workEmail: true, joinedOn: true, employmentStatus: true, version: true, createdAt: true, updatedAt: true,
  branchId: true, departmentId: true, designationId: true, jobGradeId: true, employmentTypeId: true,
  workLocationId: true, managerId: true,
  branch: { select: catalogSummary }, department: { select: catalogSummary }, designation: { select: catalogSummary },
  jobGrade: { select: catalogSummary }, employmentType: { select: catalogSummary }, workLocation: { select: catalogSummary },
  manager: { select: { id: true, displayName: true, employeeNumber: true } },
} satisfies Prisma.EmployeeSelect;
const profileFields = (privateContact: boolean) => ({
  ...directoryFields,
  ...(privateContact ? { personalEmail: true, personalPhone: true } as const : {}),
}) satisfies Prisma.EmployeeSelect;
const sortColumns = {
  name: "displayName", employeeNumber: "employeeNumber", joinedOn: "joinedOn", createdAt: "createdAt", status: "employmentStatus",
} as const satisfies Record<EmployeeListQuery["sort"], keyof Prisma.EmployeeOrderByWithRelationInput>;

const notFound = () => new HttpError(404, "EMPLOYEE_NOT_FOUND", "Employee not found.");
const stale = () => new HttpError(409, "EMPLOYEE_VERSION_CONFLICT", "Reload the employee profile and retry.");
const forbidden = () => new HttpError(403, "FORBIDDEN", "Permission required.");
const invalidInput = (message = "Check the supplied employee fields.") => new HttpError(400, "INVALID_EMPLOYEE_INPUT", message);

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const field = result.error.issues[0]?.path[0];
  throw invalidInput(typeof field === "string" ? "Check the " + field + " field." : undefined);
}

function scope<T>(response: Response, writePermission: string | null,
  operation: (tx: Tx, tenantId: string, grants: ReadonlySet<string>, profile: AuthProfile) => Promise<T>) {
  const profile: AuthProfile = response.locals.profile;
  const tenantId = profile.tenantId;
  if (profile.platform || !tenantId) throw new HttpError(403, "FORBIDDEN", "Company workspace required.");
  return withTenant(profile.user.id, tenantId, employeePermissions.read, async (tx, grants) => {
    if (writePermission) {
      if (!grants.has(writePermission)) throw forbidden();
      await lockTenant(tx, tenantId);
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
      if (tenant?.status !== "ACTIVE") throw new HttpError(403, "TENANT_ACCESS_DENIED", "Company access denied.");
    }
    return operation(tx, tenantId, grants, profile);
  });
}

function checkPrivateWrite(input: Partial<EmployeeCreateInput>, grants: ReadonlySet<string>) {
  if ((Object.hasOwn(input, "personalEmail") || Object.hasOwn(input, "personalPhone")) &&
      !(grants.has(employeePermissions.readPrivate) && grants.has(employeePermissions.managePrivate))) throw forbidden();
}

function displayName(firstName: string | null, lastName: string | null) {
  if (!firstName || !lastName) throw invalidInput("Supply both first and last names.");
  const name = firstName + " " + lastName;
  if ([...name].length > 200) throw invalidInput("First and last names must fit within 200 characters including the space.");
  return name;
}

function dateOnly(value: string | null | undefined) {
  return typeof value === "string" ? new Date(value + "T00:00:00.000Z") : value;
}

function serialize<T extends { joinedOn: Date | null }>(employee: T) {
  return { ...employee, joinedOn: employee.joinedOn?.toISOString().slice(0, 10) ?? null };
}

type Assignments = Pick<EmployeeCreateInput, "branchId" | "departmentId" | "designationId" | "jobGradeId" | "employmentTypeId" | "workLocationId">;

async function validateAssignments(tx: Tx, tenantId: string, input: Assignments, current?: {
  departmentId: string | null; designationId: string | null;
}) {
  const active = { active: true } as const;
  const key = (id: string) => ({ tenantId_id: { tenantId, id } });
  async function requireActive(catalog: string, lookup: PromiseLike<{ active: boolean } | null>) {
    const record = await lookup;
    if (!record) throw invalidInput("Choose a valid " + catalog + ".");
    if (!record.active) throw new HttpError(409, "INACTIVE_EMPLOYEE_ASSIGNMENT", "Choose an active " + catalog + ".");
  }

  if (input.branchId) await requireActive("branch", tx.branch.findUnique({ where: key(input.branchId), select: active }));
  if (input.departmentId) await requireActive("department", tx.department.findUnique({ where: key(input.departmentId), select: active }));
  if (input.jobGradeId) await requireActive("job grade", tx.jobGrade.findUnique({ where: key(input.jobGradeId), select: active }));
  if (input.workLocationId) await requireActive("work location", tx.workLocation.findUnique({ where: key(input.workLocationId), select: active }));
  if (input.employmentTypeId && !await tx.employmentType.findUnique({ where: key(input.employmentTypeId), select: { id: true } })) {
    throw invalidInput("Choose a valid employment type.");
  }

  if (input.designationId === undefined && input.departmentId === undefined) return;
  const designationId = input.designationId === undefined ? current?.designationId : input.designationId;
  if (!designationId) return;
  const departmentId = input.departmentId === undefined ? current?.departmentId : input.departmentId;
  if (!departmentId) throw invalidInput("Choose a department for the designation.");
  const designation = await tx.designation.findUnique({
    where: { tenantId_departmentId_id: { tenantId, departmentId, id: designationId } }, select: active,
  });
  if (!designation) throw invalidInput("Choose a designation from the selected department.");
  if (input.designationId && !designation.active) {
    throw new HttpError(409, "INACTIVE_EMPLOYEE_ASSIGNMENT", "Choose an active designation.");
  }
}

async function validateActivation(tx: Tx, tenantId: string, employee: Assignments & {
  id: string; joinedOn: Date | null; managerId: string | null;
}) {
  if (!employee.joinedOn || !employee.departmentId || !employee.employmentTypeId) {
    throw new HttpError(409, "EMPLOYEE_ACTIVATION_INCOMPLETE", "Set a joining date, department and employment type for an active employee.");
  }
  await validateAssignments(tx, tenantId, employee);
  if (employee.managerId) await validateManager(tx, tenantId, employee.id, employee.managerId);
}

async function write<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new HttpError(409, "DUPLICATE_EMPLOYEE_NUMBER", "This employee number is already in use.");
    }
    throw error;
  }
}

function audit(tx: Tx, response: Response, tenantId: string, profile: AuthProfile, entityId: string, action: string) {
  return writeTenantAudit(tx, { tenantId, actorId: profile.user.id, entityId, action, requestId: response.locals.requestId });
}

function sendProfile(response: Response, employee: object, status = 200) {
  if ("personalEmail" in employee || "personalPhone" in employee) {
    response.set("Cache-Control", "private, no-store");
  }
  response.status(status).json(employee);
}

async function requireNoDepartmentHeadAssignment(tx: Tx, tenantId: string, employeeId: string) {
  const department = await tx.department.findFirst({ where: { tenantId, headId: employeeId }, select: { id: true } });
  if (department) throw new HttpError(409, "EMPLOYEE_IS_DEPARTMENT_HEAD", "Resolve the department head assignment first.");
}

export const employeeRouter = Router();

employeeRouter.get("/", async (request, response) => {
  const { search, sort, direction, page, limit, status, ...assignments } = parse(employeeListQuery, request.query);
  const result = await scope(response, null, async (tx, tenantId) => {
    const contains = { contains: search.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" as const };
    const where: Prisma.EmployeeWhereInput = {
      tenantId, employmentStatus: status, ...assignments,
      OR: search ? [{ employeeNumber: contains }, { displayName: contains }, { workEmail: contains }] : undefined,
    };
    const items = await tx.employee.findMany({
      where, select: directoryFields, orderBy: [{ [sortColumns[sort]]: direction }, { id: "asc" }], skip: (page - 1) * limit, take: limit,
    });
    const total = await tx.employee.count({ where });
    return { items: items.map(serialize), total, page, limit };
  });
  response.json(result);
});

employeeRouter.post("/", async (request, response) => {
  const input = parse(employeeCreateSchema, request.body);
  const result = await write(() => scope(response, employeePermissions.manage, async (tx, tenantId, grants, profile) => {
    checkPrivateWrite(input, grants);
    await validateAssignments(tx, tenantId, input);
    const employee = await tx.employee.create({
      data: { ...input, tenantId, displayName: displayName(input.firstName, input.lastName), joinedOn: dateOnly(input.joinedOn),
        active: false, employmentStatus: "DRAFT" },
      select: profileFields(grants.has(employeePermissions.readPrivate)),
    });
    await audit(tx, response, tenantId, profile, employee.id, "EMPLOYEE_CREATED");
    return serialize(employee);
  }));
  sendProfile(response, result, 201);
});

employeeRouter.get("/:id", async (request, response) => {
  const id = parse(z.uuid(), request.params.id);
  const result = await scope(response, null, async (tx, tenantId, grants) => {
    const employee = await tx.employee.findUnique({
      where: { tenantId_id: { tenantId, id } }, select: profileFields(grants.has(employeePermissions.readPrivate)),
    });
    if (!employee) throw notFound();
    return serialize(employee);
  });
  sendProfile(response, result);
});

employeeRouter.patch("/:id", async (request, response) => {
  const id = parse(z.uuid(), request.params.id);
  const { version, ...input } = parse(employeeUpdateSchema, request.body);
  const result = await write(() => scope(response, employeePermissions.manage, async (tx, tenantId, grants, profile) => {
    const where = { tenantId_id: { tenantId, id } };
    const current = await tx.employee.findUnique({
      where, select: directoryFields,
    });
    if (!current) throw notFound();
    checkPrivateWrite(input, grants);
    if (current.version !== version) throw stale();
    if (input.departmentId !== undefined && input.departmentId !== current.departmentId) {
      await requireNoDepartmentHeadAssignment(tx, tenantId, id);
    }
    const joinedOn = dateOnly(input.joinedOn);
    const updated = { ...current, ...input, joinedOn: joinedOn === undefined ? current.joinedOn : joinedOn };
    if (updated.employmentStatus === "ACTIVE") await validateActivation(tx, tenantId, updated);
    else await validateAssignments(tx, tenantId, input, current);
    const name = input.firstName !== undefined || input.lastName !== undefined
      ? displayName(input.firstName ?? current.firstName, input.lastName ?? current.lastName) : undefined;
    const changed = await tx.employee.updateMany({
      where: { tenantId, id, version },
      data: { ...input, displayName: name, joinedOn, version: { increment: 1 } },
    });
    if (!changed.count) throw stale();
    await audit(tx, response, tenantId, profile, id, "EMPLOYEE_UPDATED");
    return serialize(await tx.employee.findUniqueOrThrow({ where, select: profileFields(grants.has(employeePermissions.readPrivate)) }));
  }));
  sendProfile(response, result);
});

const transitions: Record<EmploymentStatus, readonly EmploymentStatus[]> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["INACTIVE", "RESIGNED", "TERMINATED"],
  INACTIVE: ["ACTIVE", "RESIGNED", "TERMINATED"],
  RESIGNED: [],
  TERMINATED: [],
};

async function validateManager(tx: Tx, tenantId: string, employeeId: string, managerId: string) {
  if (employeeId === managerId) throw invalidInput("An employee cannot report to themselves.");
  const manager = await tx.employee.findUnique({
    where: { tenantId_id: { tenantId, id: managerId } }, select: { active: true },
  });
  if (!manager) throw notFound();
  if (!manager.active) throw new HttpError(409, "INACTIVE_EMPLOYEE_MANAGER", "Choose an active manager.");

  // UNION also terminates when a legacy chain already contains a cycle.
  const [chain] = await tx.$queryRaw<{ invalid: boolean }[]>`
    WITH RECURSIVE managers(id, manager_id) AS (
      SELECT id, manager_id FROM employees WHERE tenant_id = ${tenantId}::uuid AND id = ${managerId}::uuid
      UNION
      SELECT e.id, e.manager_id FROM employees e
      JOIN managers m ON e.id = m.manager_id WHERE e.tenant_id = ${tenantId}::uuid
    )
    SELECT EXISTS (SELECT 1 FROM managers WHERE id = ${employeeId}::uuid)
      OR NOT EXISTS (SELECT 1 FROM managers WHERE manager_id IS NULL) AS invalid
  `;
  if (chain?.invalid) throw new HttpError(409, "EMPLOYEE_REPORTING_CYCLE", "This manager would create or extend a reporting cycle.");
}

async function recordChange(tx: Tx, response: Response, tenantId: string, profile: AuthProfile, id: string, version: number,
  change: { kind: "MANAGER"; previousManagerId: string | null; newManagerId: string | null }
    | { kind: "STATUS"; previousStatus: EmploymentStatus; newStatus: EmploymentStatus }) {
  const reporting = change.kind === "MANAGER";
  const updated = await tx.employee.updateMany({
    where: { tenantId, id, version },
    data: {
      ...(reporting ? { managerId: change.newManagerId } : { employmentStatus: change.newStatus, active: change.newStatus === "ACTIVE" }),
      version: { increment: 1 },
    },
  });
  if (!updated.count) throw stale();
  await tx.employeeChange.create({
    data: { ...change, tenantId, employeeId: id, actorId: profile.user.id, requestId: response.locals.requestId },
    select: { id: true },
  });
  await audit(tx, response, tenantId, profile, id, reporting ? "EMPLOYEE_MANAGER_CHANGED" : "EMPLOYEE_STATUS_CHANGED");
  return serialize(await tx.employee.findUniqueOrThrow({ where: { tenantId_id: { tenantId, id } }, select: directoryFields }));
}

employeeRouter.put("/:id/manager", async (request, response) => {
  const id = parse(z.uuid(), request.params.id);
  const { managerId, version } = parse(employeeManagerSchema, request.body);
  const result = await scope(response, employeePermissions.manageReporting, async (tx, tenantId, _grants, profile) => {
    const employee = await tx.employee.findUnique({ where: { tenantId_id: { tenantId, id } }, select: directoryFields });
    if (!employee) throw notFound();
    if (employee.version !== version) throw stale();
    if (managerId === employee.managerId) return serialize(employee);
    if (managerId) await validateManager(tx, tenantId, id, managerId);
    return recordChange(tx, response, tenantId, profile, id, version, {
      kind: "MANAGER", previousManagerId: employee.managerId, newManagerId: managerId,
    });
  });
  response.json(result);
});

employeeRouter.get("/:id/direct-reports", async (request, response) => {
  const id = parse(z.uuid(), request.params.id);
  const { page, limit, status } = parse(directReportsQuery, request.query);
  const result = await scope(response, null, async (tx, tenantId) => {
    const employee = await tx.employee.findUnique({ where: { tenantId_id: { tenantId, id } }, select: { id: true } });
    if (!employee) throw notFound();
    const historical: EmploymentStatus[] = ["INACTIVE", "RESIGNED", "TERMINATED"];
    const employmentStatus = status === "HISTORICAL" ? { in: historical } : status === "ALL" ? undefined : status;
    const where = { tenantId, managerId: id, employmentStatus };
    const items = await tx.employee.findMany({
      where, select: directoryFields, orderBy: [{ displayName: "asc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit,
    });
    const total = await tx.employee.count({ where });
    return { items: items.map(serialize), total, page, limit };
  });
  response.json(result);
});

employeeRouter.patch("/:id/status", async (request, response) => {
  const id = parse(z.uuid(), request.params.id);
  const { status, version } = parse(employeeStatusSchema, request.body);
  const result = await scope(response, employeePermissions.manage, async (tx, tenantId, _grants, profile) => {
    const employee = await tx.employee.findUnique({ where: { tenantId_id: { tenantId, id } }, select: directoryFields });
    if (!employee) throw notFound();
    if (employee.version !== version) throw stale();
    if (status === employee.employmentStatus) return serialize(employee);
    if (!transitions[employee.employmentStatus].includes(status)) {
      throw new HttpError(409, "INVALID_EMPLOYEE_STATUS_TRANSITION", "This employee status transition is unavailable.");
    }
    if (status === "ACTIVE") {
      await validateActivation(tx, tenantId, employee);
    } else {
      const activeReport = await tx.employee.findFirst({ where: { tenantId, managerId: id, active: true }, select: { id: true } });
      if (activeReport) throw new HttpError(409, "EMPLOYEE_HAS_ACTIVE_REPORTS", "Reassign or clear active direct reports first.");
      await requireNoDepartmentHeadAssignment(tx, tenantId, id);
    }
    return recordChange(tx, response, tenantId, profile, id, version, {
      kind: "STATUS", previousStatus: employee.employmentStatus, newStatus: status,
    });
  });
  response.json(result);
});
