# Module 2 implementation and verification

## Platform and tenant management

- The Super Admin dashboard at `/platform` shows total, active and suspended companies, registered users, recent registrations, platform audit activity, and tenant membership statistics. `/platform/account` retains the account and session controls.
- The platform sidebar links to the dashboard, company registry and account security. The registry at `/platform/companies` supports literal search by company name, email or slug, status filtering and pagination. Search, filter and page state are reflected in the URL.
- The company screens register, display and edit the company name, legal name, email, phone, industry, size, website and address fields. Registration starts active and creates the Company Admin role in the same transaction. The profile includes logo upload and removal, status changes and a status timeline.
- Company names and emails are validated in the API. PostgreSQL enforces field sizes, unique slugs and emails, and unique normalized names for registered company profiles. Legacy tenants can retain their existing names while their profile email is unset.
- Logo uploads accept PNG, JPEG and WebP with matching file signatures and a 512 KB limit. The company stores one logo in PostgreSQL and the API serves it through the authorized profile.

## Company administrators and configuration

- Super Admins can list administrators for each company, invite a new account, or assign an existing account by email. New accounts appear as invitation pending until the recipient sets a password. Resending an invitation invalidates the previous link.
- Administrator activation and deactivation apply to the selected tenant membership and revoke sessions for that membership. The existing Account & security page manages global account activation. A password reset applies to the user account and revokes its previous sessions.
- Invitations and password resets reuse the authentication token and password setup flow. Development delivery writes the reset link to the private `.local/mail/` outbox. The UI reports delivery failures and supports retrying the link.
- Company Admins manage their own profile and configuration at `/app/company`. Configuration includes branding display name and primary color, timezone, locale, first weekday, module toggles, attendance workday and grace period, leave year and carry-forward, and payroll currency and frequency. The attendance, leave and payroll toggles and preferences provide stored settings for future modules.

## Authorization and database changes

- Platform endpoints require an authenticated platform session and the Super Admin role. Company Admin routes derive the tenant from the authenticated session and verify the active membership and role. They accept no tenant ID in the route or mutation body. The browser sends its expected membership as a precondition, so a stale tab cannot save changes into a newly selected workspace.
- The existing PostgreSQL RLS policies and tenant-qualified role and membership references remain in place. A tenant profile update policy requires both the transaction tenant scope and a matching active administrative session. Platform registry access and provisioning use database functions that check the active platform session. The normal application connection continues to use the restricted `seyyon_app` role.
- Provisioning, role assignment, account access changes, status changes and audit writes use transactions. Important operations emit platform or tenant audit events. Suspending a company revokes its sessions and blocks company sign-in while suspended. Activation allows fresh sign-in.
- Local PostgreSQL migrations `202611180005_tenant_management` and `202611180006_tenant_admin_onboarding` extend the existing tenant and user models and preserve legacy rows.

## Local verification

| Command | Result | Coverage |
| --- | --- | --- |
| `npm run db:validate` | Passed | Prisma schema validation |
| `npm run db:migrate` and `npx prisma migrate status` | Up to date | Applied both Module 2 migrations and checked the resulting migration state |
| `npm run typecheck` | Passed | TypeScript checks for shared, API, API integration tests and web |
| `npm run build` | Passed | Shared package, API and Vite web build |
| `npm test` | 4 passed | Existing health and authentication middleware tests |
| `npm run test:db -w @seyyon/api` | 19 passed | Existing authentication and RLS regression tests and the Module 2 database suite |
| `npm run test:e2e -w @seyyon/web` | 2 passed | Existing authentication browser regression and the company management workflow in local Edge |

The Module 2 database suite covers transactional tenant creation, duplicate validation, search and pagination, dashboard metrics, admin invitations and assignment, password setup and reset, membership deactivation and reactivation, Super Admin authorization, cross-tenant SQL and API isolation, company suspension and activation, status history, logo handling and configuration persistence. The browser suite covers company registration, profile editing, actual logo rendering, configuration persistence after reload, invitation state, password setup, the invited administrator workspace, suspension, registry filtering and mobile overflow.

The web build emitted non-blocking Rollup warnings about the main bundle size and third-party Zod annotations. Verification used the local project and PostgreSQL database. Production deployment and Employee Management are outside the scope of this module.

