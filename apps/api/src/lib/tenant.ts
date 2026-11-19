import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { database } from "./database.js";
import { HttpError } from "../middleware/errors.js";

// Serialize company changes that depend on the current tenant state.
export async function lockTenant(tx: Prisma.TransactionClient, tenantId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`;
}

export async function withTenant<Result>(
  actorId: string,
  selectedTenantId: string,
  permission: string | null,
  operation: (transaction: Prisma.TransactionClient) => Promise<Result>,
): Promise<Result> {
  const tenantId = z.uuid().parse(selectedTenantId);
  const userId = z.uuid().parse(actorId);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    const membership = await transaction.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: { user: { select: { disabled: true } }, tenant: { select: { status: true } }, roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!membership || membership.status !== "ACTIVE" || membership.user.disabled || membership.tenant.status !== "ACTIVE") {
      throw new HttpError(403, "TENANT_ACCESS_DENIED", "Company access denied.");
    }
    const permitted = membership.roles.some((assignment) =>
      assignment.role.permissions.some((grant) => grant.permission.key === permission));
    if (permission && !permitted) throw new HttpError(403, "FORBIDDEN", "Permission required.");
    return operation(transaction);
  });
}

