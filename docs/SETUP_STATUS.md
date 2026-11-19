# Setup verification — 18 November 2026

This section records the original infrastructure milestone. Authentication was subsequently completed locally; see the module verification below and AUTHENTICATION.md for current behavior.

- Workspace was empty and had no Git repository or existing configuration to preserve.
- Detected Node 22.22.2, npm 10.9.7, Docker 29.8.2 and Compose 5.6.0. Host psql was not installed.
- Installed workspace dependencies and generated package-lock.json. Prisma/client/adapter 7.10.1; Express 5.3.0; React 19.3.1; Vite 7.3.8; Tailwind 4.3.5; TypeScript 5.9.3.
- Generated local .env with random secrets; values are not included in documentation or version control.
- Started Docker Desktop. PostgreSQL 17 and Redis 7 containers are healthy.
- Windows rejected binding port 5432. PostgreSQL now uses configurable host port 55432; Redis uses 6379. Both bind to loopback.
- Applied initial schema and tenant security migrations successfully.
- Prisma schema validation and all workspace TypeScript checks passed.
- Four API/authentication tests and one live PostgreSQL isolation integration test passed.
- Web and API builds passed. Web emitted upstream Zod comment-annotation warnings and a bundle-size warning.
- Verified frontend HTTP 200, API liveness, and PostgreSQL readiness through the Vite proxy.

## Resolved environment failures

npm and Prisma downloads initially failed certificate verification; using Node's Windows system CA store resolved this without disabling TLS validation. The first npm post-install step stalled; restarting installation after the engine download completed produced the lockfile successfully.

Sandboxed Vite resolution was denied parent-directory access, and tsx could not query Windows user information. Approved runs outside the sandbox passed. An initial API typecheck preceded client generation and was rerun successfully afterward. An integration fixture used one parameter as both UUID and text; splitting the parameters fixed it.

## Remaining work

npm audit reports four high-severity toolchain entries from one picomatch advisory; GitHub currently marks that advisory withdrawn. See SECURITY.md for the discrepancy. Recheck before release. Authentication issuance, onboarding, role provisioning, HR modules, CI/CD and production hardening remain later phases. BullMQ and Puppeteer are deferred until their modules need jobs and PDF generation. No tenant or administrator was seeded.

## Authentication module verification

- Applied two additive authentication migrations; all four migrations are current.
- Full frontend/backend build, shared/API/web TypeScript checks, and API test-source type checks passed.
- Ten authentication integration scenarios and the original PostgreSQL RLS integration test passed (12 TAP tests including the parent lifecycle test).
- Four original API/auth middleware regression tests passed.
- Headless Microsoft Edge browser flow passed: validation, password visibility, actual login, reload/refresh, logout, protected redirects, mobile layout, forgot/reset delivery and login with the new password.
- No production deployment or tenant/employee management implementation was performed.
- Local first-administrator bootstrap is available; no permanent administrator or default password was automatically created.
- An audit INSERT/RETURNING mismatch found during testing was fixed with non-returning inserts while preserving insert-only audit privileges.
- Remaining warnings: pre-existing Zod annotation and bundle-size warnings, a pg adapter query-serialization deprecation warning, and the previously recorded npm advisory discrepancy.
