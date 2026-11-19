import { randomUUID } from "node:crypto";
import { companyAdminRole, organizationPermissions, readTenantConfig } from "@seyyon/shared";
import type { AuthProfile, CompanyInput, TenantConfig } from "@seyyon/shared";
import type { Prisma, TenantStatus } from "../../generated/prisma/client.js";
import { database } from "../../lib/database.js";
import { lockTenant, withTenant } from "../../lib/tenant.js";
import { writePlatformAudit, writeTenantAudit } from "../../lib/audit.js";
import { HttpError } from "../../middleware/errors.js";
import { hashPassword } from "../auth/password.js";
import { deliverReset } from "../auth/delivery.js";
import { newToken } from "../auth/tokens.js";
import { issuePasswordLink } from "../auth/service.js";
import { logger } from "../../lib/logger.js";

type Tx = Prisma.TransactionClient;
export type Actor = { profile: AuthProfile; requestId: string };
type RegistryCompany = {
  id: string; name: string; slug: string; companyEmail: string | null;
  status: TenantStatus; createdAt: Date; memberCount: number;
};
const notFound = () => new HttpError(404, "NOT_FOUND", "Company or administrator not found.");
const conflict = (message: string) => new HttpError(409, "CONFLICT", message);

const companyFields = {
  id: true, name: true, slug: true, status: true, createdAt: true, updatedAt: true, legalName: true,
  companyEmail: true, contactNumber: true, industry: true, companySize: true, website: true,
  address: true, country: true, state: true, city: true, postalCode: true,
} satisfies Prisma.TenantSelect;

export function assertPlatform(actor: Actor) {
  if (!actor.profile.platform) throw new HttpError(403, "FORBIDDEN", "Platform access required.");
}

async function setSession(tx: Tx, actor: Actor) {
  await tx.$executeRaw`SELECT set_config('app.admin_session_id', ${actor.profile.sessionId}, true)`;
}

async function platformScope(tx: Tx, id: string, actor: Actor, writing: boolean) {
  if (writing) await lockTenant(tx, id);
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${id}, true)`;
  await setSession(tx, actor);
  const company = await tx.tenant.findUnique({ where: { id }, select: { status: true } });
  if (!company) throw notFound();
  return company;
}

export function inCompany<T>(actor: Actor, requestedId: string | undefined, writing: boolean,
  work: (tx: Tx, id: string, status: TenantStatus) => Promise<T>) {
  if (requestedId) {
    assertPlatform(actor);
    return database.$transaction(async (tx) => {
      const [access] = await tx.$queryRaw<{ allowed: boolean }[]>`SELECT module2_platform_session(${actor.profile.sessionId}::uuid) AS allowed`;
    if (!access?.allowed) throw new HttpError(403, "FORBIDDEN", "Platform access required.");
    const { status } = await platformScope(tx, requestedId, actor, writing);
      return work(tx, requestedId, status);
    });
  }
  const id = actor.profile.tenantId;
  if (actor.profile.platform || !id) throw new HttpError(403, "FORBIDDEN", "Company workspace required.");
  return withTenant(actor.profile.user.id, id, null, async (tx) => {
    if (writing) await lockTenant(tx, id);
    await setSession(tx, actor);
    const [access] = await tx.$queryRaw<{ allowed: boolean }[]>`SELECT module2_can_edit_tenant(${id}::uuid) AS allowed`;
    if (!access?.allowed) throw new HttpError(403, "FORBIDDEN", "Company administrator access required.");
    return work(tx, id, "ACTIVE");
  });
}

async function audit(tx: Tx, actor: Actor, id: string, action: string, entityId = id) {
  const event = { actorId: actor.profile.user.id, action, requestId: actor.requestId };
  if (actor.profile.platform) await writePlatformAudit(tx, { ...event, targetId: id });
  if (!actor.profile.platform || entityId !== id) await writeTenantAudit(tx, { ...event, tenantId: id, entityId });
}

function duplicate(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function ensureCompanyAdminRole(tx: Tx, tenantId: string) {
  return tx.role.upsert({
    where: { tenantId_name: { tenantId, name: companyAdminRole } },
    create: {
      tenantId,
      name: companyAdminRole,
      permissions: {
        create: Object.values(organizationPermissions).map((key) => ({
          permission: { connect: { key } },
        })),
      },
    },
    update: {},
  });
}

export async function createCompany(actor: Actor, input: CompanyInput) {
  assertPlatform(actor);
  const id = randomUUID();
  const slug = input.name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 100).replace(/-$/, "");
  if (!slug) throw new HttpError(400, "INVALID_NAME", "Company name must contain a letter or number.");
  try {
    return await database.$transaction(async (tx) => {
      const [result] = await tx.$queryRaw<{ created: boolean }[]>`
        SELECT module2_create_tenant(${actor.profile.sessionId}::uuid, ${id}::uuid, ${input.name}, ${slug}) AS created
      `;
      if (!result?.created) throw conflict("A company with this name already exists.");
      await platformScope(tx, id, actor, false);
      const company = await tx.tenant.update({ where: { id }, data: { ...input, settings: readTenantConfig({}) }, select: companyFields });
      await ensureCompanyAdminRole(tx, id);
      await tx.$executeRaw`SELECT public.organization_seed_employment_types(${id}::uuid)`;
      await audit(tx, actor, id, "COMPANY_REGISTERED");
      return company;
    });
  } catch (error) {
    if (duplicate(error)) throw conflict("A company with this name or email already exists.");
    throw error;
  }
}

export function listCompanies(actor: Actor, search: string, status: TenantStatus | undefined, page: number, limit: number) {
  assertPlatform(actor);
  // Escape LIKE metacharacters so the search is literal.
  const pattern = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
  return database.$transaction(async (tx) => {
    const [result] = await tx.$queryRaw<{ items: RegistryCompany[]; total: number }[]>`
      WITH filtered AS (
        SELECT * FROM module2_registry(${actor.profile.sessionId}::uuid)
        WHERE (${status ?? null}::text IS NULL OR status::text = ${status ?? null})
          AND (name ILIKE ${pattern} OR slug ILIKE ${pattern} OR company_email ILIKE ${pattern})
      ), items AS (
        SELECT id, name, slug, company_email AS "companyEmail", status,
          created_at AS "createdAt", member_count::integer AS "memberCount"
        FROM filtered ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}
      )
      SELECT coalesce((SELECT jsonb_agg(items ORDER BY "createdAt" DESC, id DESC) FROM items), '[]') AS items,
        (SELECT count(*)::integer FROM filtered) AS total
    `;
    return { ...result!, page, limit };
  });
}

export function dashboard(actor: Actor) {
  assertPlatform(actor);
  return database.$transaction(async (tx) => {
    const [summary] = await tx.$queryRaw<{ total: number; active: number; suspended: number; users: number; memberships: number; recent: RegistryCompany[] }[]>`
      WITH registry AS (SELECT * FROM module2_registry(${actor.profile.sessionId}::uuid)),
      recent AS (
        SELECT id, name, slug, company_email AS "companyEmail", status,
          created_at AS "createdAt", member_count::integer AS "memberCount"
        FROM registry ORDER BY created_at DESC, id DESC LIMIT 6
      )
      SELECT count(*)::integer AS total, (count(*) FILTER (WHERE status = 'ACTIVE'))::integer AS active,
        (count(*) FILTER (WHERE status = 'SUSPENDED'))::integer AS suspended,
        coalesce(sum(member_count), 0)::integer AS memberships, (SELECT count(*)::integer FROM users) AS users,
        coalesce((SELECT jsonb_agg(recent ORDER BY "createdAt" DESC, id DESC) FROM recent), '[]') AS recent
      FROM registry
    `;
    const activity = await tx.platformAuditLog.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 12,
      select: { id: true, action: true, targetId: true, createdAt: true },
    });
    return { ...summary!, activity };
  });
}

export function companyDetails(actor: Actor, id?: string) {
  return inCompany(actor, id, false, async (tx, tenantId) => {
    const company = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: companyFields });
    const [logo] = await tx.$queryRaw<{ present: boolean }[]>`SELECT logo IS NOT NULL AS present FROM tenants WHERE id = ${tenantId}::uuid`;
    const history = await tx.platformAuditLog.findMany({
      where: { targetId: tenantId, action: { in: ["COMPANY_REGISTERED", "COMPANY_ACTIVATED", "COMPANY_SUSPENDED"] } },
      select: { id: true, action: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return { ...company, hasLogo: !!logo?.present, history };
  });
}

export async function updateCompany(actor: Actor, id: string | undefined, input: CompanyInput) {
  try {
    await inCompany(actor, id, true, async (tx, tenantId) => {
      await tx.tenant.update({ where: { id: tenantId }, data: input, select: { id: true } });
      await audit(tx, actor, tenantId, "COMPANY_UPDATED");
    });
  } catch (error) {
    if (duplicate(error)) throw conflict("A company with this name or email already exists.");
    throw error;
  }
}

export function setCompanyStatus(actor: Actor, id: string, next: TenantStatus) {
  return inCompany(actor, id, true, async (tx, tenantId, current) => {
    if (current === next) return;
    await tx.$executeRaw`SELECT module2_set_tenant_status(${actor.profile.sessionId}::uuid, ${tenantId}::uuid, ${next}::"TenantStatus")`;
    await tx.authSession.updateMany({ where: { tenantId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, actor, tenantId, next === "ACTIVE" ? "COMPANY_ACTIVATED" : "COMPANY_SUSPENDED");
  });
}

export function getConfig(actor: Actor, id?: string) {
  return inCompany(actor, id, false, async (tx, tenantId) =>
    readTenantConfig((await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } })).settings));
}
export function setConfig(actor: Actor, id: string | undefined, config: TenantConfig) {
  return inCompany(actor, id, true, async (tx, tenantId) => {
    await tx.tenant.update({ where: { id: tenantId }, data: { settings: config }, select: { id: true } });
    await audit(tx, actor, tenantId, "COMPANY_CONFIGURATION_UPDATED");
  });
}

export function getLogo(actor: Actor, id?: string) {
  return inCompany(actor, id, false, async (tx, tenantId) =>
    (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { logo: true } })).logo);
}
export function updateLogo(actor: Actor, id: string | undefined, logo: string | null) {
  return inCompany(actor, id, true, async (tx, tenantId) => {
    await tx.tenant.update({ where: { id: tenantId }, data: { logo }, select: { id: true } });
    await audit(tx, actor, tenantId, logo ? "COMPANY_LOGO_UPDATED" : "COMPANY_LOGO_REMOVED");
  });
}

const adminFilter = (tenantId: string) => ({ tenantId, roles: { some: { role: { name: companyAdminRole } } } });
export function listAdmins(actor: Actor, id: string) {
  return inCompany(actor, id, false, async (tx, tenantId) => {
    const admins = await tx.membership.findMany({
      where: adminFilter(tenantId), orderBy: [{ user: { email: "asc" } }, { id: "asc" }],
      select: { id: true, status: true, user: { select: { email: true, disabled: true, passwordConfigured: true } } },
    });
    return admins.map(({ id: membershipId, status, user }) => ({ id: membershipId, status, email: user.email, accountDisabled: user.disabled, invitationPending: !user.passwordConfigured }));
  });
}

async function adminAccount(tx: Tx, tenantId: string, membershipId: string) {
  const member = await tx.membership.findFirst({ where: { id: membershipId, ...adminFilter(tenantId) },
    select: { id: true, userId: true, status: true } });
  if (!member) throw notFound();
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${member.userId}::uuid FOR UPDATE`;
  const user = await tx.user.findUniqueOrThrow({ where: { id: member.userId },
    select: { id: true, email: true, disabled: true, passwordConfigured: true, platformAdmin: { select: { userId: true } } } });
  if (user.platformAdmin) throw new HttpError(403, "FORBIDDEN", "Platform administrator accounts must be managed separately.");
  return { member, user };
}

async function sendLink(actor: Actor, email: string, token: string, invitation: boolean) {
  try {
    await deliverReset(email, token, invitation ? "Set up your Seyyon People Company Admin account" : undefined);
    return "queued" as const;
  } catch (error) {
    logger.error({ requestId: actor.requestId, errorType: error instanceof Error ? error.name : "Unknown" }, "Company admin password link delivery failed");
    return "failed" as const;
  }
}

export async function addAdmin(actor: Actor, id: string, email: string, action: "invite" | "assign") {
  assertPlatform(actor);
  const initialHash = action === "invite" ? await hashPassword(newToken()) : null;
  const result = await inCompany(actor, id, true, async (tx, tenantId) => {
    let account = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, disabled: true, platformAdmin: { select: { userId: true } }, email: true } });
    if (action === "invite") {
      if (account) throw conflict("This email already has an account. Assign the existing account instead.");
      const userId = randomUUID();
      const [result] = await tx.$queryRaw<{ created: boolean }[]>`
        SELECT module2_create_account(${actor.profile.sessionId}::uuid, ${userId}::uuid, ${email}, ${initialHash!}) AS created
      `;
      if (!result?.created) throw conflict("This email already has an account. Assign the existing account instead.");
      account = { id: userId, email, disabled: false, platformAdmin: null };
    }
    if (!account) throw notFound();
    if (account.platformAdmin || account.disabled) throw conflict("Choose an enabled account without platform privileges.");
    const role = await ensureCompanyAdminRole(tx, tenantId);
    const member = await tx.membership.upsert({ where: { tenantId_userId: { tenantId, userId: account.id } },
      create: { tenantId, userId: account.id }, update: {} });
    const key = { tenantId, membershipId: member.id, roleId: role.id };
    if (await tx.membershipRole.findUnique({ where: { tenantId_membershipId_roleId: key } })) throw conflict("This account is already a company administrator.");
    await tx.membershipRole.create({ data: key });
    const token = action === "invite" ? await issuePasswordLink(tx, account.id, actor.requestId, "ADMIN_INVITATION_ISSUED") : null;
    await audit(tx, actor, tenantId, token ? "COMPANY_ADMIN_INVITED" : "COMPANY_ADMIN_ASSIGNED", member.id);
    return { id: member.id, email: account.email, status: member.status, token };
  });
  return { id: result.id, email: result.email, status: result.status,
    delivery: result.token ? await sendLink(actor, result.email, result.token, true) : null };
}

export function setAdminStatus(actor: Actor, id: string, membershipId: string, status: "ACTIVE" | "DISABLED") {
  return inCompany(actor, id, true, async (tx, tenantId) => {
    const { member, user } = await adminAccount(tx, tenantId, membershipId);
    if (status === "ACTIVE" && user.disabled) throw conflict("Activate the global account from account security first.");
    if (member.status === status) return;
    await tx.membership.update({ where: { id: member.id }, data: { status } });
    await tx.authSession.updateMany({ where: { tenantId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, actor, tenantId, status === "ACTIVE" ? "COMPANY_ADMIN_ACTIVATED" : "COMPANY_ADMIN_DEACTIVATED", member.id);
  });
}

export async function sendAdminReset(actor: Actor, id: string, membershipId: string, invitation: boolean) {
  const result = await inCompany(actor, id, true, async (tx, tenantId) => {
    const { member, user } = await adminAccount(tx, tenantId, membershipId);
    if (user.disabled || member.status !== "ACTIVE") throw conflict("Activate the administrator before sending a password link.");
    if (invitation && user.passwordConfigured) throw conflict("This administrator has already set up their password.");
    const token = await issuePasswordLink(tx, user.id, actor.requestId, invitation ? "ADMIN_INVITATION_ISSUED" : undefined);
    await audit(tx, actor, tenantId, invitation ? "COMPANY_ADMIN_INVITATION_RESENT" : "COMPANY_ADMIN_RESET_REQUESTED", member.id);
    return { email: user.email, token };
  });
  return { delivery: await sendLink(actor, result.email, result.token, invitation) };
}


