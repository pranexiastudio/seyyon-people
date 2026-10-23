# Employee account activation

Migration: `20261023180000_employee_account_activation` (created, NOT applied).
No database resets, seeds, data deletion, SMTP sends, commits, or pushes were
performed during implementation. Prisma Client generation is local code generation.

## Schema and lifecycle

`User.activationPending` defaults to false. New employee accounts set it to true
and remain inactive with an undisclosed random password hash. Existing active
and deactivated accounts are unchanged. Existing inactive accounts from the
earlier provisioning implementation are deliberately not automatically enrolled;
they need a separately reviewed, tenant-specific enrollment/backfill that verifies
they were never activated or deliberately deactivated. No broad backfill is supplied.

`EmployeeActivationToken` has a unique user and token hash, tenant/user relations,
expiry and delivery/consumption timestamps, and durable invitation-rate counters.
Only SHA-256 hashes of 32-byte cryptographic random tokens are stored. The token
has 256 bits of entropy, expires 24 hours after issuance, and is never returned
from an API or written to application logs.

The database holds one invitation row per user. Reissuing replaces the hash,
invalidating every earlier invitation. User row locks serialize resend and
redemption across API processes. Redemption conditionally consumes the current
delivered, unexpired token and sets the password in the same transaction. A
failed account update rolls back consumption. Accounts must be pending and
inactive, have never logged in, belong to the token tenant, have an active or
probation employee in that tenant, and not belong to a suspended tenant.

SMTP sending occurs outside the transaction. Tokens are not redeemable until
SMTP acceptance is recorded. Failure leaves the account inactive and invalidates
the attempted invitation. SMTP acceptance means the receiving server accepted
the message; it cannot guarantee inbox delivery. There is no automatic retry or
outbox. Administrators can resend after resolving the delivery problem.

## Configuration

Set these in the backend runtime environment or untracked `apps/api/.env`.
Do not put SMTP credentials in `VITE_*` variables, source control, logs, command
arguments, or frontend configuration.

| Variable | Requirement |
| --- | --- |
| `SMTP_HOST` | SMTP provider hostname; required |
| `SMTP_PORT` | Integer 1–65535; defaults to 587 |
| `SMTP_USER` | SMTP authentication username; required |
| `SMTP_PASSWORD` | SMTP authentication credential; required |
| `SMTP_FROM` | Plain sender email address, verified with your SMTP provider; required |
| `SMTP_SECURE` | `true` for implicit TLS (typically 465); otherwise `false` for required STARTTLS (typically 587) |
| `APP_WEB_URL` | Frontend origin only, e.g. `https://people.example.com`; required. HTTPS required in production; HTTP allowed only on local development loopback |
| `VITE_API_URL` | Optional frontend API base including `/api/v1`. Defaults to same-origin `/api/v1`, using the existing Vite proxy in development |

Existing database, JWT, and CORS settings remain required. Configure CORS for the
frontend origin when serving the API separately. SMTP configuration is validated
at API startup in every environment, without contacting SMTP or printing values.
TLS certificate verification is always enabled, and plaintext fallback is disabled.
Verify sender ownership with the provider; syntax validation cannot establish it.

## API and frontend

- Existing `POST /api/v1/employees` provisions the employee and inactive account
  atomically and then attempts delivery. The existing employee response gains
  `activationInvitation: SENT | RETRY_REQUIRED`. A delivery failure does not roll
  back the employee or turn creation into an error that encourages duplicate
  employee creation. Bulk import adds `invitationsPending` to its summary.
- `POST /api/v1/employees/:id/activation-invitation` sends/resends an invitation.
  Requires JWT authentication, a validated tenant, and both `employee:create` and
  `employee:update` permissions. Existing administrator privileges are preserved.
  Platform administrators must provide a validated `X-Tenant-Id` target. Returns
  only a generic message. Delivery failures return a generic 503, never provider
  diagnostics or account details.
- `POST /api/v1/auth/activate` accepts JSON `{ token, password }` only. No account,
  employee, tenant ID, or email is accepted. Passwords require 12 or more characters,
  uppercase/lowercase/number/symbol, and at most 72 UTF-8 bytes to avoid bcrypt
  truncation. Validation and invalid/reused/unavailable links return 400; known
  expired links return 410; throttling returns 429; temporary failures return 503.
  Responses include no authentication tokens or session cookies.
- Invitations link to `/activate#token=...`. The public page removes the fragment
  from the address bar after reading it and holds it only in component memory.
  Password confirmation is validated locally. Success links to sign-in without
  creating a session. Reopen the email link after a page reload. Use the newest
  invitation after a resend. Configure production SPA fallback for `/activate`.

Invitation issuance permits one request per minute and five per hour per account,
persisted in PostgreSQL. Public activation and authenticated resend also permit
10 requests per minute per actual client IP **per API process**. Forwarded headers
are not trusted directly. Configure a trusted reverse proxy and an additional
shared edge limit for multi-instance deployments. Do not broadly trust arbitrary
proxy headers. Bulk employee creation remains governed by existing creation permissions.

The existing frontend login remains its demo implementation; connecting it to
real backend authentication is still Phase 1B, outside this change. Backend login
can authenticate a successfully activated account with its chosen password.

## Safe migration application — only after explicit approval

1. Take and verify a PostgreSQL backup. Review the migration SQL and confirm the
   configured `DATABASE_URL` points to the intended environment without printing it.
2. Schedule deployment: the new backend reads the new User column immediately,
   so apply the migration before starting the new application version. Review all
   pending migrations; `migrate deploy` applies all pending migrations, not just
   this one. Stop if unexpected migrations or drift are present.
3. From PowerShell, after approval, run:

```powershell
Set-Location 'C:\Users\VIJAY PRANEESH\seyyon-people\apps\api'
& ..\..\node_modules\.bin\prisma.cmd migrate status --schema .\prisma\schema.prisma
# Review the pending list before executing the next command.
& ..\..\node_modules\.bin\prisma.cmd migrate deploy --schema .\prisma\schema.prisma
& ..\..\node_modules\.bin\prisma.cmd generate --schema .\prisma\schema.prisma
& ..\..\node_modules\.bin\prisma.cmd migrate status --schema .\prisma\schema.prisma
```

4. Configure SMTP and frontend origin, deploy both builds, then smoke-test with
   an explicitly authorized test employee and real mailbox: creation, receipt,
   activation, login through the API, resend invalidation, and replay rejection.
   Check logs for generic statuses only. No automatic down migration is supplied;
   investigate a failed deployment before any rollback or schema changes.

## Verification boundaries

Automated tests use mocked Prisma transactions with serialization/rollback, real
bcrypt password hashing, mocked SMTP, and a real Nest HTTP pipeline with mocked
activation persistence. Live PostgreSQL row locks, migration execution, real SMTP
authentication/delivery, inbox behavior, and browser interaction still require
staging verification after migration approval. No live database or SMTP account
was used. Prisma's database-free schema diff matches the additive SQL migration.

Commands used:

```text
npm.cmd run prisma:generate --workspace=@seyyon/api
npm.cmd run test --workspace=@seyyon/api -- --runInBand --no-cache
npm.cmd run build --workspace=@seyyon/api
npm.cmd run build --workspace=@seyyon/web
```

Final results: **19 backend suites / 150 tests passed**. Backend and frontend
production builds passed. Prisma schema validation and `git diff --check` passed.
The database-free schema diff was inspected against the migration SQL; no SQL
was executed against PostgreSQL.

The web build needs filesystem access beyond this environment's default sandbox;
it was verified with the approved build escalation. Existing ts-jest transform and
Vite bundle-size warnings remain. npm reports 28 dependency audit findings across
the repository (4 low, 13 moderate, 10 high, 1 critical); attribution and remediation
were not audited in this task, and no unrelated dependency upgrades were performed.

## Changed files

| Area | Files (relative to repository root) |
| --- | --- |
| Dependencies | `apps/api/package.json`, `package-lock.json` |
| Database | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261023180000_employee_account_activation/migration.sql` |
| SMTP | `apps/api/src/common/config/smtp.config.ts`, `apps/api/src/modules/auth/activation-mail.service.ts`, `apps/api/src/modules/auth/activation-mail.service.spec.ts` |
| Activation | `apps/api/src/modules/auth/activation.service.ts`, `apps/api/src/modules/auth/activation.service.spec.ts`, `apps/api/src/modules/auth/activation-rate.guard.ts`, `apps/api/src/modules/auth/dto/activate-account.dto.ts`, `apps/api/src/modules/auth/activation.validation.spec.ts`, `apps/api/src/modules/auth/activation.http.spec.ts` |
| Auth wiring | `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/modules/auth/auth.controller.ts` |
| Employee provisioning | `apps/api/src/modules/employees/employees.service.ts`, `apps/api/src/modules/employees/employees.controller.ts`, `apps/api/src/modules/employees/employees.module.ts`, `apps/api/src/modules/employees/employees.authorization.spec.ts` |
| Frontend | `apps/web/src/App.tsx`, `apps/web/src/pages/ActivateAccountPage.tsx` |
| Documentation | `docs/employee-account-activation.md`, `docs/backend-security-follow-up.md` |
