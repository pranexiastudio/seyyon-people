# Database design

## Initial entities

| Entity | Ownership | Purpose |
| --- | --- | --- |
| Tenant | Platform registry | Company identity, unique slug, active/suspended state |
| User | Global identity | Unique normalized email, password hash, disabled state |
| PlatformAdmin | Platform | Separate administrator entitlement |
| Membership | Tenant | Unique company/user membership with active/disabled state |
| Role | Tenant | Named company role; supports custom roles |
| Permission | Global catalog | Stable permission keys |
| MembershipRole | Tenant | Composite tenant-safe membership/role assignment |
| RolePermission | Tenant | Composite tenant-safe permission grant |
| AuditLog | Tenant | Append-only company events |
| PlatformAuditLog | Platform | Append-only control-plane events |

UUIDs identify entities. PostgreSQL columns use snake_case; TypeScript uses camelCase. Authentication migration 004 adds unique lower(email) and lower(employee_login_id) indexes; login uses case-insensitive lookup. Existing data with case-folded duplicates must be reconciled before applying these indexes. No credentials or tenant data are seeded.

## Authentication additions

User retains its existing password_hash and disabled fields, with optional global employee_login_id, login failure count, and lock expiry. There is no duplicate identity schema.

AuthSession stores global session ownership, selected tenant/platform context, absolute expiry, remember preference, and revocation. RefreshToken stores only hashes and consumption timestamps; retained consumed hashes detect replay and revoke the family. PasswordReset stores expiring, single-use token hashes. AuthEvent is an insert-only global identity audit stream; it carries no employee or payroll payloads.

These are platform identity records rather than company-owned domain data. Service methods scope sessions to their authenticated owner. The selected tenant_id on AuthSession is context only; its platform/tenant combination has a database check constraint. New HR records will still require tenant ownership and RLS.

Runtime user updates are restricted to password_hash, disabled, login_failures and locked_until columns. Runtime cannot grant platform administrator status. The auth_memberships function is the narrow pre-context membership lookup needed for login, and returns only active memberships and company names. Existing tenant table policies are unchanged.

Tenant-owned join keys include tenant_id. Composite unique constraints support cross-table tenant-safe references. Indexes support company audit timelines, user memberships, role grants, permission lookups, and platform audit timelines.

## Roles and policies

Compose creates a migration owner and seyyon_app, a login role without ownership, superuser privileges, role creation, or BYPASSRLS. SQL migrations enable and force row-level security on tenant tables. Policies compare tenant_id to transaction-local app.tenant_id. Tenant registry reads are restricted to the selected company. The runtime role has no tenant registry mutation or platform entitlement mutation grants.

User identity reads are necessary before tenant resolution. Global identity tables are accessible only to internal authentication/provisioning services; never expose a generic users endpoint. Consider narrowing identity access through stored procedures before implementing provisioning. Runtime platform audit writes must be guarded by platform authorization.

Audit logs grant SELECT and INSERT only; UPDATE and DELETE are not granted to the runtime role. Migration owners and superusers remain privileged and must be restricted operationally.

## Migration discipline

Apply migrations with DIRECT_URL and run the API with DATABASE_URL. Schema generation alone is insufficient: migrations contain RLS and grants not represented by Prisma. New company tables require tenant_id, tenant-safe keys, appropriate indexes, RLS policies, and runtime grants in the same migration.

The initial migration can be generated without PostgreSQL; actual application and isolation tests require a running database. Database integration tests use a separate owner connection for fixtures and the runtime connection for isolation assertions.

## Future modules

Add organization/employees before attendance and leave; add payroll only after versioned compensation, currency/decimal precision, statutory jurisdiction, effective dating, approval rules, and financial retention requirements are decided. Store monetary values as Decimal, never floating point. Sensitive fields require a documented encryption and key management design.

