# SEYYON PEOPLE — System Architecture & Multi-Tenant Design
**Product:** Seyyon People  
**Company:** Pranexia Studio  
**Category:** Multi-tenant HRMS & Workforce Collaboration SaaS  
**Tagline:** People First. Work Smarter.  

---

## 1. High-Level Architectural Overview

Seyyon People is architected as an enterprise-ready, multi-tenant Software-as-a-Service (SaaS) platform built on a clean monorepo architecture. It enforces strict separation of concerns, zero-trust tenant isolation, role-based and permission-based authorization, and resilient communication between client applications, backend services, and external integrations.

```
                              ┌────────────────────────────────────────┐
                              │            Clients / Users             │
                              │  (Web Desktop, Tablet, Mobile Web)     │
                              └──────────────────┬─────────────────────┘
                                                 │ HTTPS / WSS
                                                 ▼
                              ┌────────────────────────────────────────┐
                              │    Reverse Proxy / Ingress / Gateway   │
                              │     (Nginx / Cloudflare / Traefik)     │
                              └──────────────────┬─────────────────────┘
                                                 │
                                                 ▼
                 ┌─────────────────────────────────────────────────────────────┐
                 │                NestJS Modular Backend (apps/api)            │
                 │                                                             │
                 │  ┌───────────────────────┐   ┌───────────────────────────┐  │
                 │  │ Tenant Context Guard  │   │  Permissions & RBAC Guard │  │
                 │  └──────────┬────────────┘   └─────────────┬─────────────┘  │
                 │             │                              │                │
                 │             ▼                              ▼                │
                 │  ┌───────────────────────────────────────────────────────┐  │
                 │  │                  Domain Modules                       │  │
                 │  │  • Auth & Identity        • Attendance & Shifts       │  │
                 │  │  • Multi-Tenancy Registry • Leave & Holidays          │  │
                 │  │  • Employee Lifecycle     • Payroll & Payslip PDF     │  │
                 │  │  • Work / Task Boards     • Team Chat (WebSockets)    │  │
                 │  │  • Meetings & Calendar    • Performance Reviews       │  │
                 │  │  • Document Vault         • Reports & BI Exports      │  │
                 │  │  • SaaS Subscriptions     • Centralized Audit Logs    │  │
                 │  └──────────────────────────┬────────────────────────────┘  │
                 └─────────────────────────────┼───────────────────────────────┘
                                               │
                      ┌────────────────────────┼────────────────────────┐
                      ▼                        ▼                        ▼
        ┌─────────────────────────┐  ┌───────────────────┐  ┌──────────────────┐
        │       PostgreSQL        │  │   Redis & Queue   │  │  Storage / S3    │
        │   (Prisma ORM with      │  │  (BullMQ for Async│  │  (Encrypted docs │
        │  Multi-Tenant Isolation)│  │   Jobs & Presence)│  │  & payslip PDFs) │
        └─────────────────────────┘  └───────────────────┘  └──────────────────┘
```

---

## 2. Multi-Tenant SaaS Architecture

### 2.1 Isolation Strategy
Seyyon People implements a **Logical Multi-Tenancy with Tenant ID Partitioning and Connection Scoping** pattern within a shared PostgreSQL database.

1. **Discriminator Column:** Every tenant-specific table contains a non-nullable `tenantId` foreign key referencing the `Tenant` table.
2. **Server-Side Tenant Resolution:**
   - Tenant context is **never** accepted from untrusted client-supplied request bodies or query parameters.
   - For authenticated requests, the user's verified JWT contains the secure claims: `userId`, `tenantId`, and `role`.
   - The NestJS `TenantContextMiddleware` and `TenantGuard` extract and validate the tenant identity from the verified session, attaching the verified `TenantContext` to `req.tenant`.
   - Global platform administrators (`PLATFORM_SUPER_ADMIN`) operate with platform scope and can only act on specific tenants through explicit, audited administrative actions.
3. **Compound Uniqueness & Indexes:**
   All unique business keys (e.g., `employeeCode`, `email`, `departmentCode`, `shiftName`, `payslipNumber`) are composite keys scoped with `tenantId` (e.g., `@@unique([tenantId, employeeCode])`). This ensures two tenants can have employee `EMP-001` or department `ENG` without collisions.
4. **Data Leakage Prevention:**
   - All repository and service queries explicitly inject `tenantId: req.tenant.id` into database filters.
   - Cross-tenant searches, foreign key traversal, and report exports are blocked by strict validation.
   - Insecure Direct Object References (IDOR) are thwarted because any attempt to query an entity by `id` without matching `tenantId` results in an immediate `404 Not Found` or `403 Forbidden`.

---

## 3. Security Model

### 3.1 Authentication & Tokens
- **Password Security:** Passwords hashed with `bcrypt` (12 salt rounds). Plain-text passwords never stored or logged.
- **Access Tokens:** Short-lived JWTs (15 minutes expiration) containing user ID, tenant ID, and assigned role.
- **Refresh Tokens:** Long-lived tokens (7 days expiration) with cryptographically secure rotation and server-side invalidation.
- **CSRF & Cookie Protection:** HTTP-only, secure, `SameSite=Strict` cookies or standard Authorization Bearer headers.

### 3.2 Authorization & Guard Layers
Seyyon People utilizes a **Deny-by-Default** three-tier authorization chain:
1. `JwtAuthGuard`: Verifies authentication token integrity, revocation status, and user active status.
2. `TenantGuard`: Ensures the user belongs to an active, non-suspended tenant organization.
3. `PermissionsGuard`: Evaluates whether the user's role or custom permissions satisfy the `@RequirePermissions(...)` metadata.

---

## 4. Frontend Architecture (`apps/web`)

- **State Management:** TanStack Query (React Query) handles all server state, cache invalidation, and background synchronization.
- **Form Architecture:** React Hook Form coupled with Zod schemas for compile-time and runtime validation.
- **Design System:** Custom Tailwind CSS design tokens matching Pranexia Studio brand guidelines:
  - Deep Navy (`#0B132B`, `#1C2541`) for navigation and structural framing.
  - Primary Blue (`#2563EB`) for actionable controls.
  - Cyan (`#06B6D4`) for accents and highlight badges.
  - Semantic Status: Emerald (Active/Approved), Amber (Pending/Late), Rose (Rejected/Absent), Purple (Processing/Review).
- **Navigation Shell:** Collapsible responsive sidebar, contextual breadcrumbs, global command palette, real-time notification drawer, and role preview switcher.

---

## 5. Background Jobs & Real-Time

- **Asynchronous Workers (BullMQ / Redis):**
  - Payroll batch processing and payslip generation.
  - Biometric punch log batch ingestion and conflict reconciliation.
  - Scheduled notification dispatches and email reminders (leave approvals, document expiry).
- **Real-Time Collaboration (NestJS WebSockets / Socket.IO):**
  - Instant channel messages and direct messages scoped to authenticated tenant rooms (`tenant:${tenantId}:channel:${channelId}`).
  - Live punch events and clock-in status updates.
  - Real-time unread notification counters.
