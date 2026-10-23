# Backend security follow-up

Activation follow-up: the approved SMTP and 24-hour invitation workflow is now
implemented in [employee-account-activation.md](employee-account-activation.md).
Its migration is created but unapplied. The activation-pending notes below record
the state at the end of the earlier security task.

Scope: Priority 1 only. No frontend integration, schema changes, migration,
seed execution, database resets, or existing-account password changes.

## Implemented behavior

- Employee create/update validates department, designation, and manager IDs
  against the request tenant. Employee and account provisioning share a transaction.
- New employee accounts are inactive and receive random undisclosed password
  hashes. The shared default password is removed. Activation is pending approval;
  newly provisioned users cannot sign in until that workflow is implemented.
- Attendance import, company attendance, and pending corrections require HR/admin
  roles and the corresponding permissions. Employee correction submission remains
  self-service. Self-service operations require an employee in the current tenant.
- Validated body DTOs cover attendance, biometric arrays, employee import arrays,
  payroll runs, and tenant updates/status changes.
- Login, refresh, and access-token authentication reject inactive users,
  suspended/missing tenants, and tenantless non-platform users.
- Refresh JWTs have random unique identifiers. Full JWT SHA-256 digests replace
  bcrypt refresh hashes. Rotation uses an atomic compare-and-swap update, so only
  one concurrent request succeeds. Logout clears the stored digest.
- Legacy bcrypt refresh sessions require login again. Existing access tokens
  remain valid until expiration, subject to current account/tenant checks.
- Chat checks database account/tenant identity at connection and before join/send;
  disconnects on access-token expiration and checks idle subscribers every 15
  seconds. A suspension may therefore take up to 15 seconds to remove an idle
  subscriber. Timers are cleared when disconnected.
- Self-only payslip access is enforced across roles. Reading another employee's
  payslip requires read-all permission or existing administrator privileges.
- Tenant operations require database-validated tenant context, including platform
  administrators using X-Tenant-Id. Only explicitly marked platform handlers may
  omit it. Platform overview, tenant listing, and tenant suspension remain available.
- Seed code does not populate RolePermission. Explicit tenant grants override
  global grants; explicit grants override code defaults. Unseeded roles use tested
  defaults. Managers receive no organization-wide approval/report permissions by
  default because those handlers do not yet enforce reporting-line scope.

## Verification

Regression suites cover employee references/provisioning, attendance role metadata,
payload validation and employee scoping, authentication status, real JWT refresh
rotation/replay/logout, access-token identity and permission resolution, tenant
guards/decorators, chat session expiration/status checks, and payslip ownership.
Database calls and sockets are mocked. These are not live PostgreSQL or full HTTP
end-to-end tests. Concurrent refresh tests exercise compare-and-swap logic with a
mock atomic update, not concurrent database transactions.

Commands:

```text
npm.cmd run test --workspace=@seyyon/api -- --runInBand --no-cache
npm.cmd run build --workspace=@seyyon/api
```

Final run: 15 suites, 102 tests passed. Backend production build passed.
`git diff --check` passed. Existing ts-jest warnings about shared JavaScript
transformation remain; no test failures resulted.

## Files changed during this task

Paths below are relative to `apps/api/src/` unless prefixed with `docs/`.
Some changes were captured by repository commits made externally while this task
was running; no commits were created by this agent.

| Area | Files |
| --- | --- |
| Permissions | `common/config/role-permissions.ts`, `common/config/role-permissions.spec.ts` |
| Tenant context | `common/guards/tenant.guard.ts`, `common/guards/tenant.guard.spec.ts`, `common/decorators/current-tenant.decorator.ts`, `common/decorators/current-tenant.decorator.spec.ts`, `common/decorators/platform-operation.decorator.ts` |
| Authentication | `modules/auth/auth.service.ts`, `modules/auth/auth.service.spec.ts`, `modules/auth/jwt.strategy.ts`, `modules/auth/jwt.strategy.spec.ts` |
| Employees | `modules/employees/employees.service.ts`, `modules/employees/employees.controller.ts`, `modules/employees/employees.authorization.spec.ts` |
| Attendance | `modules/attendance/attendance.controller.ts`, `modules/attendance/attendance.service.ts`, `modules/attendance/attendance.dto.ts`, `modules/attendance/attendance.authorization.spec.ts` |
| Payroll | `modules/payroll/payroll.service.ts`, `modules/payroll/payroll.controller.ts`, `modules/payroll/payroll.dto.ts`, `modules/payroll/payroll.authorization.spec.ts` |
| Chat | `modules/chat/chat.gateway.ts`, `modules/chat/chat.gateway.spec.ts` |
| Platform routes | `modules/dashboard/dashboard.controller.ts`, `modules/tenants/tenants.controller.ts`, `modules/tenants/tenants.dto.ts` |
| Report | `docs/backend-security-follow-up.md` |

## Pending approval and remaining limits

Activation needs a deliberate delivery/recovery design. Proposed follow-up:
hashed, expiring, single-use activation tokens in a dedicated Prisma model;
tenant-authorized invitation/reissue, public password-setup redemption, and a
configured email delivery channel. That model requires a new migration. No such
schema or delivery changes were made here.

Current fixes need no migration. Database-level same-tenant composite foreign
keys or PostgreSQL row-level security would require separate approved migrations.
Existing malformed cross-tenant links were not repaired or deleted.

The existing single-refresh-session-per-user design remains. Replay rejection
does not revoke an otherwise valid successor token. Persistent token families,
multiple-device sessions, and immediate access-token revocation require a separate
session design. Custom database grants remain authoritative; live grants were not
inspected. Existing global administrator bypass behavior is preserved.
