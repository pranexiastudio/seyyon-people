# Authentication module — local development

## Start and create the first administrator

Use the root README setup commands, then open http://localhost:5173/login. WEB_ORIGIN must match the browser origin exactly. Use localhost rather than 127.0.0.1 with the supplied environment; cross-origin writes are rejected.

In PowerShell, set BOOTSTRAP_ADMIN_EMAIL to your chosen email and BOOTSTRAP_ADMIN_PASSWORD to a unique password of at least 12 characters, then run:

```powershell
npm run auth:bootstrap
Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD
npm run dev
```

The CLI uses DIRECT_URL locally, creates only a global platform administrator, refuses to overwrite existing users, and stops if any platform administrator already exists. No default credentials, tenants, or employee records are seeded. Tenant Management and Employee Management are not part of this module.

## API

All paths are under /api/v1/auth. All responses use Cache-Control: no-store. All writes require an exact matching Origin header, including login and refresh. Protected endpoints use Authorization: Bearer accessToken.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | /login | identifier, password, remember; returns accessToken and profile, sets refresh cookie |
| POST | /refresh | Cookie-based rotation; returns new JWT/profile and replaces cookie |
| POST | /logout | Revokes the cookie's session, including previously issued access JWTs |
| POST | /logout-all | Revokes every session owned by the authenticated user |
| GET | /me | Current user, session, context, roles, permissions and allowed membership selectors |
| GET | /sessions | Active sessions owned by the authenticated user; no token values |
| DELETE | /sessions/:id | Revoke one owned session; another user's ID returns 404 |
| POST | /context | membershipId selects a verified company membership; null selects platform only for entitled users |
| GET | /workspace | Validated company context; platform sessions cannot enter implicitly |
| GET | /platform | Requires current platform entitlement and platform context |
| POST | /forgot-password | email; generic 202 for known, unknown or disabled accounts |
| POST | /reset-password | token and new password; consumes reset, revokes all sessions |
| PATCH | /accounts/:id/status | disabled boolean; platform-only activation/deactivation; cannot change own status |

Login accepts email or an optional globally unique Employee ID login alias (case-insensitive). No Employee model is added. Company roles are existing Role records and may be customized. Supported role names remain Company Admin, HR Manager, HR Executive, Finance / Payroll Admin, Department Manager, Team Lead and Employee. Authorization uses assigned permission keys, never role labels. Super Admin comes only from PlatformAdmin and is independent of membership. Role provisioning is deferred to the appropriate future module.

The initial company session selects the first active membership by company name and membership ID; users can switch using the verified context list. No login request may supply tenant_id, roles, or arbitrary extra fields. Tenant endpoints derive tenant context from the server session and pass it through withTenant/RLS. A platform administrator needs an ordinary membership to enter any company context.

## Passwords and sessions

Passwords use Node's async scrypt with a random 16-byte salt, N=131072, r=8, p=1, a 64-byte derived key and constant-time verification. Unknown accounts also run scrypt against a dummy value. New/reset passwords require 12–128 characters. Legacy non-scrypt hashes cannot authenticate and require reset; none are migrated blindly.

Login limits are 20 attempts per IP per 15 minutes, with a 15-minute account lock after five bad passwords. Reset requests/completions share a five-attempt IP limit per 15 minutes. The general API rate limit also applies. These in-memory limits are suitable for the single local API process.

Access JWTs expire after 15 minutes and require subject, session ID, issuer, audience, issued-at and expiry. Every authenticated request checks current session expiry/revocation, user status, membership/company status and platform entitlement. Existing access tokens stop working after logout, password reset or deactivation.

Refresh values are cryptographically random, stored only as SHA-256 hashes, and rotated once under database row locks. Consumed tokens are retained: reuse revokes the session, including the winner of a concurrent duplicate refresh. Password resets and login also lock the user row to prevent reset/login races.

The browser stores access tokens in memory only. Refresh cookies are HttpOnly, SameSite=Strict and limited to /api/v1/auth. Secure is enabled for HTTPS production mode; the local HTTP workflow needs Secure=false. Remember me adds persistent cookie expiry with a 30-day absolute session cap; unchecked uses a session cookie and one-day server cap. Rotation does not extend the absolute expiry. Browser refreshes are deduplicated within a tab and serialized across tabs where the Web Locks API is available. Clients without cross-tab locks must avoid concurrent refresh; strict replay detection intentionally revokes duplicates.

Logout uses the refresh cookie so it can invalidate a session even when its access JWT has expired. Session endpoints require a valid authenticated session. Re-enabling an account does not revive revoked sessions.

## Local password-reset delivery

No email provider is configured. Eligible reset requests write a private JSON delivery artifact to the Git-ignored root .local/mail directory. Open its url locally to use the reset page; the link carries its token in the URL fragment, which the page removes from browser history after reading. Links expire after 30 minutes, and requesting a new one invalidates prior links.

The API never returns or logs reset tokens. The local artifact contains a bearer secret: keep the folder private and remove delivered artifacts when no longer needed. Unknown and disabled users receive the same HTTP response without a delivery artifact. Production delivery is explicitly disabled; an email adapter and queue are future work. The local file write is not atomic with the database transaction; a disk failure makes that request fail, and retrying safely creates a new token.

## Database changes

Migrations 003 and 004 add authentication tables, user login/lock fields, normalized unique indexes, explicit runtime grants and the fixed-search-path auth_memberships SECURITY DEFINER function. Existing schema/migrations are retained; existing tenant RLS policies remain intact.

Session, reset and authentication audit records are global identity security data. Tenant-owned HR data continues to require tenant_id and RLS. Runtime auth audit access is INSERT only; audit writes use non-returning inserts to preserve this grant. Platform account status changes are transactionally recorded in PlatformAuditLog.

## Validation

```text
npm run db:validate
npm run typecheck
npm test
npm run test:db -w @seyyon/api
npm run test:e2e -w @seyyon/web
npm run build
```

Database tests use isolated UUID fixtures in the configured local database and clean them up. Browser tests use installed Microsoft Edge, start local servers when required, and cover validation, visibility toggle, real login, refresh after reload, logout, protected routes and mobile overflow. Install Edge or adjust the Playwright channel for another installed browser.

Integration tests cover correct and incorrect credentials, disabled users, Employee ID login, lockout, rate limiting, expired JWTs/sessions/reset links, refresh replay and races, revocation, account status, reset reuse, platform isolation, suspended tenants, disabled memberships and permission checks. Existing health/auth/RLS regression tests are retained.

No deployment was performed. Existing upstream bundle/annotation warnings and the previously recorded npm advisory discrepancy remain tracked in SECURITY.md.

References: [Node crypto](https://nodejs.org/api/crypto.html), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

