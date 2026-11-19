# Development roadmap

1. Foundation: workspace, TypeScript, Vite/Express, Prisma schema, SQL RLS, restricted database role, Compose, setup UI, health endpoints, documentation, baseline tests.
2. Authentication: local login, refresh rotation/revocation, sessions, password resets, account status, verified tenant switching, RBAC checks and local first-admin bootstrap are complete. Future identity work: onboarding, administrator MFA, company role provisioning, subscription/module entitlements and real email delivery.
3. Organization and employee directory: effective organization hierarchy, employee lifecycle, private documents and field access; Company Admin, HR Manager, HR Executive, Finance / Payroll Admin, Department Manager, Team Lead and Employee templates. Super Admin remains a platform entitlement.
4. Time operations: shifts, holidays, attendance transactions, leave and approval workflows. Optional tenant-enabled biometric integrations with idempotent imports.
5. Payroll: jurisdiction-specific requirements, versioned salary rules, decimal calculations, approval/locking, idempotency, audits and reconciliation.
6. Payslips and expenses: private PDF generation using Puppeteer, authorized downloads, expense approvals; Redis/BullMQ workers when needed, with tenant context and retry policies.
7. Employee self-service, reports and analytics: permission-scoped queries, server pagination, exports and reporting read models.
8. Platform operations: tenant and user management, subscriptions, module configuration, workflow configuration, notifications, company/integration settings and audit explorer.
9. Production readiness: end-to-end and cross-tenant tests, accessibility, performance, disaster recovery, monitoring, CI/CD, penetration testing and operational runbooks.

Each milestone requires request validation, loading/empty/error/success UI, permission tests and audit coverage. Payroll and attendance changes require transaction and concurrency tests. Do not introduce placeholder production data. Review tenancy and information-access implications before adding module tables or APIs.

