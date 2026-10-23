# SEYYON PEOPLE — Database Design & Schema Specification
**Product:** Seyyon People | **Company:** Pranexia Studio  
**Database Engine:** PostgreSQL 16 (via Prisma ORM)

---

## 1. Relational Entity-Relationship Overview

The database architecture is designed with strict relational integrity, composite foreign key constraints for multi-tenant data isolation, non-destructive auditability, and index optimizations.

```
                  ┌───────────────────────────────┐
                  │      SubscriptionPlan         │
                  └──────────────┬────────────────┘
                                 │ 1:N
                  ┌──────────────▼────────────────┐
                  │           Tenant              │
                  └──────┬─────────────────┬──────┘
                         │ 1:N             │ 1:N
           ┌─────────────▼──────┐   ┌──────▼─────────────┐
           │     Department     │   │     User / Auth    │
           └─────────────┬──────┘   └──────┬─────────────┘
                         │ 1:N             │ 1:1
           ┌─────────────▼──────┐          │
           │    Designation     │          │
           └─────────────┬──────┘          │
                         │ 1:N             │
                  ┌──────▼─────────────────▼──────┐
                  │           Employee            │
                  └──────┬─────────────────┬──────┘
                         │                 │
    ┌────────────────────┼─────────────────┼─────────────────────┐
    │ 1:N                │ 1:N             │ 1:N                 │ 1:N
┌───▼──────────────┐ ┌───▼───────────┐ ┌───▼───────────────┐ ┌───▼──────────────┐
│ AttendanceRecord │ │  LeaveRequest │ │  SalaryStructure  │ │      Task        │
└──────────────────┘ └───────────────┘ └───┬───────────────┘ └──────────────────┘
                                           │ 1:N
                                     ┌─────▼───────────────┐
                                     │      Payslip        │
                                     │  (with Cycle link)  │
                                     └─────────────────────┘
```

---

## 2. Key Data Integrity Decisions

### 2.1 Multi-Tenant Primary & Composite Keys
- All core tables use cryptographically secure UUID (`@id @default(uuid())`) primary keys.
- Every business table enforces a composite uniqueness constraint incorporating `tenantId`:
  - `Employee`: `@@unique([tenantId, employeeCode])` and `@@unique([tenantId, email])`
  - `Department`: `@@unique([tenantId, code])`
  - `AttendanceRecord`: `@@unique([tenantId, employeeId, date])`
  - `LeaveBalance`: `@@unique([tenantId, employeeId, leaveTypeId, year])`
  - `PayrollCycle`: `@@unique([tenantId, month, year])`
  - `Payslip`: `@@unique([tenantId, payrollCycleId, employeeId])` and `@@unique([tenantId, payslipNumber])`

### 2.2 Decimal Safety for Financial Records
In order to prevent floating point rounding anomalies in payroll and salary calculations:
- `basicSalary`, `hra`, `grossEarnings`, `netPay`, `totalDeductions`, `pfEmployee`, `esiEmployee`, and `professionalTax` are explicitly stored as `Decimal(12, 2)` types.
- Platform subscription prices are stored as `Decimal(10, 2)`.

### 2.3 Non-Destructive Retention Policies
- **Finalized Payroll Records:** Payslips and Payroll Cycles cannot be cascade-deleted once finalized.
- **Audit Trails:** Centralized `AuditLog` captures actor ID, IP address, user agent, action enum (`CREATE`, `UPDATE`, `DELETE`, `APPROVE`, `FINALIZE`), and before/after JSON diffs.
- **Employee Exit:** Employee status transitions to `RESIGNED` or `TERMINATED` with `dateOfExit` instead of hard deletion to maintain statutory compliance and payroll history.

---

## 3. Indexing Strategy for Query Performance

| Table | Index Columns | Purpose |
| :--- | :--- | :--- |
| `User` | `[tenantId, role]` | Fast role-based team queries and access verification |
| `Employee` | `[tenantId, departmentId]`, `[tenantId, status]`, `[tenantId, managerId]` | Directory filtering, hierarchy traversal |
| `AttendanceRecord` | `[tenantId, date]`, `[tenantId, employeeId]` | Daily attendance calculation & monthly timesheet views |
| `LeaveRequest` | `[tenantId, status]`, `[tenantId, employeeId]` | Manager approval queues and pending counters |
| `Task` | `[tenantId, status]`, `[tenantId, assigneeId]`, `[tenantId, projectId]` | Kanban board rendering, sprint views |
| `ChatMessage` | `[channelId, createdAt]` | Chronological chat history loading with pagination |
| `AuditLog` | `[tenantId, createdAt]`, `[tenantId, entityType]` | Security auditing and compliance filtering |
