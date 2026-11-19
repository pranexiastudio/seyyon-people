import type { Prisma } from "../generated/prisma/client.js";

export function writeTenantAudit(
  transaction: Prisma.TransactionClient,
  event: { tenantId: string; actorId: string; action: string; entityId?: string; requestId: string },
) {
  return transaction.auditLog.create({ data: event });
}

export function writePlatformAudit(
  transaction: Prisma.TransactionClient,
  event: { actorId: string; action: string; targetId?: string; requestId: string },
) {
  return transaction.platformAuditLog.create({ data: event });
}

