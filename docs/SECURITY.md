# Security

This is an infrastructure baseline, not a production security certification.

## Implemented boundaries

- Environment validation; local credentials generated with cryptographic randomness and ignored by Git.
- JWT verification restricted to HS256 with issuer, audience, expiry, subject, issued-at and active-user checks.
- Active membership, tenant status and permission validation inside the tenant transaction.
- Transaction-local RLS context with non-bypass runtime role and tenant-safe foreign keys.
- Separate platform administrator entitlement with no automatic tenant bypass.
- Helmet, configured CORS origin, body limits, rate limiting and generated request IDs.
- Central error responses avoid stack traces and credentials.
- Tenant and platform audit helpers; runtime audit grants are append-only.
- Database and Redis ports bind only to loopback in local Compose.

A tenant selector supplied by a client is untrusted. Call withTenant only with an actor identity supplied by verified authentication. Do not trust user/role claims or selected tenant values without database validation. SQL identifiers and policy names remain static; tenant context values are bound parameters.

Do not log authorization headers, cookies, tokens, employee payloads, salary data, passwords or connection strings. Error logging records request IDs and error classes rather than raw database errors. Audit events deliberately omit arbitrary payloads to reduce PII duplication. Future sensitive mutations must write audit events within the mutation transaction.

## Before production

Authentication now includes scrypt password hashing, 15-minute access JWTs, rotating refresh tokens with replay revocation, session revocation, logout, account lockout, and local password resets. See AUTHENTICATION.md. Before production, implement secure onboarding, administrator MFA, signing-key rotation, real email delivery, shared rate limiting and operational secret management. HS256 currently assumes one trusted issuer; move to asymmetric signing when issuer and API trust boundaries diverge. Never mint development tokens through a public route.

Define least-privilege role templates and permission catalogs; do not infer permissions from a role label. Implement and test scoped platform provisioning before exposing administrative endpoints. Keep migration credentials out of runtime deployments.

Use TLS, secret management, encrypted backups and restore drills, data retention and deletion policies, field-level protection for employee/payroll identifiers, dependency scanning, and security review. Configure a distributed rate-limit store before running multiple API replicas, and explicitly configure trusted reverse proxies. CORS is not authorization.

Redis and PostgreSQL Compose images are for local development. Production needs managed services or hardened operations, credential rotation, network controls and monitoring. Pin deployable images to reviewed digests. PDFs and job payloads must use tenant authorization and private storage; Puppeteer must never fetch arbitrary untrusted URLs without outbound restrictions.

RLS cannot protect against a compromised privileged database owner. A runtime SQL injection could alter application context, so parameterized queries, service authorization and restricted credentials remain mandatory.

## Dependency review — 18 November 2026

The completed npm installation reported four high-severity entries, all tracing to picomatch through the Vite development toolchain (picomatch, fdir, tinyglobby, and Vite). The npm registry's latest picomatch was 4.0.7; no compatible patched version was available during setup. GitHub marks [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) withdrawn on this date, while npm still reports it. Reconcile the advisory status and rerun audit before release. No forced Vite downgrade or audit suppression was applied. Keep development servers private and do not feed untrusted glob patterns to development tools.

