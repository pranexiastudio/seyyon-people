# Architecture

## Decisions

Use npm workspaces because npm is already available and the initial workspace does not require an additional task orchestrator. One lockfile captures the dependency tree. Shared code builds before applications; rebuild packages/shared after editing it during development.

Use a modular Express monolith initially. Modules will own routes, request schemas, services, and repositories. Domain services receive a transaction client, keeping payroll and attendance mutations and their audit events in one transaction. Split services only when operational evidence justifies the cost.

Use ESM and strict TypeScript. Prisma 7 uses the PostgreSQL driver adapter and a generated client local to apps/api. Vite builds the frontend independently. Shared Zod contracts cross the HTTP boundary without exposing database models.

Use a shared PostgreSQL database with tenant_id on every company-owned table. Composite foreign keys include tenant_id to reject cross-company relationships. Tenant and User are global identity/control-plane records; memberships, roles, assignments, permission grants, and company audit events are tenant-owned.

## Tenant boundary

JWT verification checks signature, algorithm, issuer, audience, expiry, required claims, and current user status. A selected tenant is an untrusted selector, never authorization. After authentication, a route must call withTenant using response.locals.userId and its required permission. It sets transaction-local app.tenant_id using a bound SQL parameter, validates active membership, active company, current user status, and role permissions, then runs the operation on that same transaction.

Never return the transaction client or start asynchronous work that outlives its transaction. Never use the global client for tenant repositories. Background jobs must re-resolve membership/service authorization and establish their own tenant transaction. The auth workspace endpoint resolves tenant context from the authenticated session; clients submit only an untrusted membership selector when switching context.

RLS is fail-closed for missing tenant context; FORCE RLS and a non-owner, non-bypass runtime role provide defense in depth. Context is local to the transaction so pooled connections do not retain tenant identity. Keep explicit tenant predicates in future repository queries too.

## Platform boundary

PlatformAdmin is a separate global entitlement. A company role named Super Admin grants no platform access. requirePlatformAdmin must run after authenticate. Platform administration does not imply membership in a company or automatically bypass tenant RLS.

Future cross-tenant control-plane operations need narrowly scoped database procedures or a separate credential and service boundary, with explicit authorization and platform audit events. That credential is not available to this API foundation. Tenant creation and platform role provisioning are deliberately not exposed.

## Frontend

React Router owns navigation; TanStack Query owns server state. React Hook Form and Zod validate login. Tailwind tokens and shadcn-style source components provide the design system. Login/reset pages are public; company and platform account pages use separate protected routes. The infrastructure setup screen is accessible only from platform context at /setup.

## Authentication decisions

Identity, sessions, refresh hashes, reset hashes, and authentication events are global security records. A session carries an optional tenant_id as its selected context, not as record ownership: a platform session has no tenant, and a company session must select a currently active membership. JWTs identify the session only; tenant and role claims supplied by a client are never authoritative.

The SECURITY DEFINER auth_memberships function exposes only active membership IDs, tenant IDs, and company names for a supplied authenticated actor. Its fixed search path and explicit execute grant keep the pre-context RLS exception narrow. Only server authentication services invoke it; its actor argument must come from verified credentials. The API still uses the restricted runtime database credential.

Employee IDs are implemented as optional globally unique login aliases on User because login has no verified company context yet. This avoids ambiguous cross-company lookups without creating an Employee model. Future company-specific employee numbers can remain separate; an alternative company-qualified login would require an explicit design change.

See AUTHENTICATION.md for refresh rotation, resets, account status, password hashing, and the local-only bootstrap boundary.

## Operations

Liveness is process health; readiness currently checks PostgreSQL connectivity only, not migration completeness, Redis, or all schema privileges. Redis is optional until background work exists. API errors have stable codes and server-generated request IDs. Production needs structured log collection, distributed rate limiting, reverse proxy configuration, TLS, backups, monitoring, and deployment automation.

