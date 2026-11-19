import type { Prisma } from "../../generated/prisma/client.js";
import { database } from "../../lib/database.js";
import { HttpError } from "../../middleware/errors.js";

type Client = Prisma.TransactionClient;
export type CompanyContext = { id: string; tenantId: string; name: string };
export function listContexts(client: Client, userId: string) {
  return client.$queryRaw<CompanyContext[]>`SELECT membership_id AS id, tenant_id AS "tenantId", company_name AS name FROM auth_memberships(${userId}::uuid)`;
}
export async function profile(userId: string, sessionId: string) {
  return database.$transaction(async (transaction) => {
    const session = await transaction.authSession.findUnique({ where: { id: sessionId } });
    const user = await transaction.user.findUnique({ where: { id: userId }, select: { id: true, email: true, disabled: true } });
    if (!session || !user || user.disabled || session.userId !== userId || session.revokedAt || session.expiresAt <= new Date()) {
      throw new HttpError(401, "UNAUTHENTICATED", "Please sign in again.");
    }
    const contexts = await listContexts(transaction, userId);
    const canAccessPlatform = !!await transaction.platformAdmin.findUnique({ where: { userId } });
    let roles: string[] = [];
    let permissions: string[] = [];
    let companyName: string | null = null;
    if (session.platform) {
      if (!canAccessPlatform) throw new HttpError(403, "FORBIDDEN", "Platform access required.");
      roles = ["Super Admin"];
    } else {
      const context = contexts.find((entry) => entry.tenantId === session.tenantId);
      if (!context) throw new HttpError(403, "TENANT_ACCESS_DENIED", "Company access denied.");
      companyName = context.name;
      await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${context.tenantId}, true)`;
      const membership = await transaction.membership.findUniqueOrThrow({
        where: { id: context.id },
        include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
      });
      roles = membership.roles.map((assignment) => assignment.role.name);
      permissions = [...new Set(membership.roles.flatMap((assignment) => assignment.role.permissions.map((grant) => grant.permission.key)))];
    }
    return { user: { id: user.id, email: user.email }, sessionId, platform: session.platform, tenantId: session.tenantId, companyName, roles, permissions, contexts, canAccessPlatform };
  });
}

