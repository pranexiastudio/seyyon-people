# Phase 1 authentication foundation

## Scope

Production and development login now use the backend. There is no default user,
arbitrary-email identity, or persona switcher. Unrelated module fixtures remain
outside this phase; connecting login does not make their existing screens live.
The platform registry reads the protected API; its simulated status mutation is
disabled. No Prisma schema, migration, seed, database record, attendance, or office
project change is included.

## Deployment assumptions checked in source

- Vite proxies `/api` to Nest on localhost. The browser can use `/api/v1` without
  a cross-origin request. The proxy must preserve Origin, Cookie and Set-Cookie.
- Existing CORS allows credentials and `X-Requested-With`; no CORS modification
  was necessary. Browser credentialed cross-origin requests use `credentials:
  include` and an exact allowed origin. Allowlisted origins are not authentication.
- Production documentation describes HTTPS ingress, but contains no verified live
  routing/hostname configuration. Recommended deployment is one HTTPS frontend
  origin with `/api/v1` forwarded to Nest on the same origin.
- Same-site HTTPS API subdomains can receive the host-only API cookie when an
  explicitly configured API URL and exact CORS origin are used. Unrelated-site
  frontend/API hosting is unsupported by this SameSite=Lax design. Do not change
  to SameSite=None without separately reviewing CSRF and browser cookie policies.
- Use one canonical frontend origin: Web Locks and BroadcastChannel coordinate
  tabs within that origin, not between different allowed frontend origins.
- Production requires the existing production environment mode, distinct secure
  JWT configuration, explicit allowed HTTPS frontend origin, and valid activation
  SMTP configuration. No configured values were printed or inspected.
- Cookie names must not collide with another app's cookies on the API host.
  HTTPS termination must preserve the auth path. No Domain attribute is set.
- Modern browsers with Web Locks and BroadcastChannel are required; unsupported
  browsers fail closed. Localhost is a secure browser context for Web Locks;
  production requires HTTPS. There is no insecure multi-tab fallback.

## Browser API contract

All endpoints are under `/api/v1`. Login, refresh and logout require JSON,
`X-Requested-With: seyyon-browser`, and an exact configured Origin. Missing/null,
malformed and foreign Origins are rejected. Production requires an HTTPS Origin.
The header causes CORS preflight for cross-origin callers; simple cross-origin
forms cannot satisfy it. Backend authorization on business APIs remains bearer
JWT plus existing tenant/role/permission guards.

| Endpoint | Request | Response |
| --- | --- | --- |
| POST /auth/login | `{email,password}` | `{user,accessToken,expiresIn:900}` and refresh cookie |
| POST /auth/refresh | `{}` plus refresh cookie | `{accessToken,expiresIn:900}` and rotated cookie |
| GET /auth/me | Authorization bearer access token | Minimal identity, tenant metadata, permissions |
| POST /auth/logout | `{}` plus refresh cookie; no access token needed | Success and expired cookie |
| POST /auth/activate | Existing invitation/password request | Existing activation behavior, no session |

The browser transport intentionally replaces refresh tokens in JSON bodies and
responses. Legacy integrations need updating before deployment. The service-level
JWT/digest/rotation protections are preserved. Swagger summaries describe the new
transport; no legacy refresh-body fallback is exposed.

`seyyon_refresh` is HttpOnly, SameSite=Lax, host-only, path `/api/v1/auth`, seven
days, and Secure in production. Deletion uses the same attributes. Access tokens
and confirmed identities live only in memory. The obsolete localStorage identity
is removed and never trusted. Token/profile responses have Cache-Control:no-store.
No token appears in BroadcastChannel messages.

## Restoration, refresh and logout

Restoration rotates the cookie then calls `/auth/me`; protected content stays
blocked until backend validation succeeds. Network/server failures block content
with a retry state. Rejected refreshes return to sign-in. Forbidden API responses
do not cause refresh. Access tokens refresh before expiry and on an eligible 401.
Concurrent refreshes share a promise and cookie operations hold a cross-tab lock.
Only GET/HEAD may be automatically retried, once. Mutations are never replayed.

Logout synchronously clears identity, access token, timers and user query caches,
increments a session generation, and notifies other tabs. Login/refresh/profile
and API responses from an older generation cannot restore state or return private
data to callers. Logout waits for earlier auth responses before sending its cookie
revocation so their Set-Cookie response cannot silently restore that session.

Backend logout verifies the signed refresh token and conditionally clears only
its matching stored digest. It can revoke an expired matching refresh token;
this grants no access. A stale token cannot revoke its successor. Malformed
cookies are cleared. A valid cookie is retained on storage failure so a subsequent
retry can revoke the actual session. Offline/failed logout
is explicitly reported as unconfirmed with a retry action. Closing/reloading the
browser before confirmed logout can leave a server session; do not claim remote
revocation when the server did not acknowledge it.

Existing limitations remain: one refresh session per user; issued access JWTs may
remain valid for 15 minutes after logout; no immediate access revocation, token
family replay revocation, absolute session lifetime, MFA or password recovery.
Login rate limiting, seed safety, employment offboarding and comprehensive security
audit events remain follow-up work from the audit. No production readiness claim.

## Verification boundaries

Frontend Vitest/Testing Library tests mock fetch, browser coordination primitives
and responses. Backend HTTP tests use real Nest routing, validation, Passport JWT,
bcrypt, CORS and authorization guards with mocked Prisma/tenant services. Existing
activation tests retain mocked SMTP and database transactions. No live PostgreSQL
or SMTP service is started, and no migration or seed command is run.

Commands: `npm.cmd run test --workspace=@seyyon/web`,
`npm.cmd run test --workspace=@seyyon/api -- --runInBand --no-cache`,
`npm.cmd run build --workspace=@seyyon/api`,
`npm.cmd run build --workspace=@seyyon/web`, and `git diff --check`.

Final local results: 5 frontend files / 26 tests passed; 22 backend suites / 171
tests passed; frontend and backend production builds passed. The final scope
check found 27 changed/new files, all in the approved list. Existing package
versions in the lockfile did not change; 94 test dependency entries were added.
Diff and trailing-whitespace checks passed.

The first frontend build caught a Web Locks generic return-type error; it was
corrected and the build rerun successfully. Frontend tests/build needed sandbox
escalation for esbuild parent-directory reads. Dependency installation initially
failed certificate/cache checks; it succeeded using Node's system certificate
store and a temporary npm cache, without disabling TLS verification. Remaining
non-failing diagnostics: React Router future flags, existing ts-jest JavaScript
transform warnings, and Vite's large-chunk warning. Negative HTTP tests deliberately
exercise rejected CORS requests and simulated storage failures and may log errors.

Before release, separately authorize staging checks using an existing test account:
real login and activation-to-login, cookie flags through HTTPS ingress, actual
Origin/preflight handling, reload restoration, concurrent browser tabs, expiry,
offline logout/retry, role downgrade, suspended tenant, platform API denial and
validated tenant selection. PostgreSQL refresh races and activation row locks
still need live integration verification. Database schema deployment status has
not been checked; the previously added activation migration must already match
the deployed application. This phase does not apply it.
