-- Additive only. Existing users are not enrolled in activation automatically.
BEGIN;
ALTER TABLE "User" ADD COLUMN "activationPending" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "EmployeeActivationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "lastRequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestWindowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeActivationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmployeeActivationToken_userId_key" ON "EmployeeActivationToken"("userId");
CREATE UNIQUE INDEX "EmployeeActivationToken_tokenHash_key" ON "EmployeeActivationToken"("tokenHash");
CREATE INDEX "EmployeeActivationToken_tenantId_userId_idx" ON "EmployeeActivationToken"("tenantId", "userId");
CREATE INDEX "EmployeeActivationToken_expiresAt_idx" ON "EmployeeActivationToken"("expiresAt");
ALTER TABLE "EmployeeActivationToken" ADD CONSTRAINT "EmployeeActivationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeActivationToken" ADD CONSTRAINT "EmployeeActivationToken_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
