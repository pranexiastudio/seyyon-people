# SEYYON PEOPLE — Role-Based Access Control (RBAC) & Permissions Matrix
**Product:** Seyyon People | **Company:** Pranexia Studio

---

## 1. Overview of Standard Roles

| Role Code | Role Title | Description & Scope |
| :--- | :--- | :--- |
| `PLATFORM_SUPER_ADMIN` | Platform Super Admin | Platform operator. Oversees customer tenants, subscription plans, platform health, and audited support. No unrestricted access to private employee data. |
| `COMPANY_ADMIN` | Company Admin | Organization executive / IT administrator. Full control within their single tenant: org settings, departments, designations, policies, user roles. |
| `HR_ADMIN` | HR Admin | Human resources manager. Manages employee lifecycle, attendance, leave approvals, shifts, payroll processing, documents, and company announcements. |
| `MANAGER` | Team Lead / Manager | Department or project manager. Manages assigned team members, assigns tasks, reviews team leave/attendance, conducts performance reviews. |
| `EMPLOYEE` | Individual Contributor | Standard staff member. Self-service access to own attendance, leave applications, personal payslips, assigned tasks, team chat, and meetings. |

---

## 2. Exhaustive Permissions Matrix

Legend:
- **`YES`**: Granted by default
- **`OWN`**: Granted strictly for records owned by the current user / employee
- **`TEAM`**: Granted strictly for employees directly or indirectly reporting to this manager
- **`NO`**: Strictly denied by default

| Module & Action | Permission Identifier | Super Admin | Company Admin | HR Admin | Manager | Employee |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Tenant & Organization** | | | | | | |
| View Organization Details | `tenant:read` | YES | YES | YES | YES | YES |
| Create / Onboard Tenants | `tenant:create` | YES | NO | NO | NO | NO |
| Update Tenant Profile & Settings | `tenant:update` | YES | YES | NO | NO | NO |
| Suspend / Reactivate Tenant | `tenant:suspend` | YES | NO | NO | NO | NO |
| Manage Departments & Designations | `department:manage` | NO | YES | YES | NO | NO |
| **Employee Lifecycle** | | | | | | |
| View Employee Directory | `employee:read` | NO | YES | YES | TEAM | YES (Basic) |
| Create New Employee Record | `employee:create` | NO | YES | YES | NO | NO |
| Update Employee Details | `employee:update` | NO | YES | YES | NO | OWN (Contact) |
| Terminate / Offboard Employee | `employee:delete` | NO | YES | YES | NO | NO |
| View Sensitive Statutory Info (PAN, Bank) | `employee:view_sensitive` | NO | YES | YES | NO | OWN |
| Bulk Import Employees (CSV) | `employee:create` | NO | YES | YES | NO | NO |
| Export Employee Directory | `employee:export` | NO | YES | YES | NO | NO |
| **Attendance & Shifts** | | | | | | |
| Clock-In / Clock-Out Punch | `attendance:record` | NO | YES | YES | YES | OWN |
| View Attendance Timesheets | `attendance:read` | NO | YES | YES | TEAM | OWN |
| Approve Attendance Corrections | `attendance:approve` | NO | YES | YES | TEAM | NO |
| Manage Shift Schedules & Grace Times | `attendance:manage_shifts`| NO | YES | YES | NO | NO |
| Ingest Biometric Device Punches | `attendance:import_biometric`| NO | YES | YES | NO | NO |
| Export Attendance Summary | `attendance:export` | NO | YES | YES | TEAM | NO |
| **Leave Management** | | | | | | |
| Apply for Leave | `leave:apply` | NO | YES | YES | YES | OWN |
| View Leave Balances & History | `leave:read` | NO | YES | YES | TEAM | OWN |
| Approve / Reject Leave Request | `leave:approve` | NO | YES | YES | TEAM | NO |
| Configure Leave Policies & Accruals | `leave:manage_policies` | NO | YES | YES | NO | NO |
| Manage Holiday Calendar | `leave:manage_policies` | NO | YES | YES | NO | NO |
| **Payroll & Compensation** | | | | | | |
| View Own Payslip PDF & History | `payroll:read_self` | NO | YES | YES | YES | OWN |
| View All Employee Salaries & Registers | `payroll:read_all` | NO | YES | YES | NO | NO |
| Configure Salary Structures (Basic/HRA/PF) | `payroll:manage_structures`| NO | YES | YES | NO | NO |
| Execute Monthly Payroll Run | `payroll:process` | NO | YES | YES | NO | NO |
| Approve & Finalize Payroll Cycle | `payroll:finalize` | NO | YES | YES | NO | NO |
| Download Bank Transfer & PF ECR Files | `reports:payroll` | NO | YES | YES | NO | NO |
| **Tasks & Projects** | | | | | | |
| View Projects & Task Boards | `task:read` | NO | YES | YES | YES | YES (Assigned)|
| Create Project & Board | `project:manage` | NO | YES | YES | YES | NO |
| Create & Assign Tasks | `task:create` | NO | YES | YES | YES | OWN |
| Update Task Status & Subtasks | `task:update` | NO | YES | YES | YES | OWN |
| Delete Task | `task:delete` | NO | YES | YES | YES (Owner) | NO |
| **Team Chat & Collaboration** | | | | | | |
| Access Chat Channels & DMs | `chat:access` | NO | YES | YES | YES | YES |
| Create Public / Department Channel | `chat:create_channel` | NO | YES | YES | YES | NO |
| Delete Channel / Moderate Messages | `chat:moderate` | NO | YES | NO | NO | NO |
| **Meetings & Calendar** | | | | | | |
| View Calendar & Invitations | `meeting:read` | NO | YES | YES | YES | YES |
| Schedule Meetings & Generate Links | `meeting:schedule` | NO | YES | YES | YES | YES |
| Cancel / Reschedule Team Meeting | `meeting:manage` | NO | YES | YES | YES (Owner) | OWN |
| **Documents Vault** | | | | | | |
| View Personal Documents (Contracts, IDs) | `document:read` | NO | YES | YES | TEAM | OWN |
| Upload Employee Documents | `document:upload` | NO | YES | YES | NO | OWN |
| View Confidential Documents | `document:view_confidential` | NO | YES | YES | NO | NO |
| **Performance Management** | | | | | | |
| Create Performance Review Cycles | `performance:manage_cycles`| NO | YES | YES | NO | NO |
| Submit Self-Evaluation | `performance:review` | NO | YES | YES | YES | OWN |
| Submit Manager Assessment & Ratings | `performance:review` | NO | YES | YES | TEAM | NO |
| View Historical Review Scores | `performance:read` | NO | YES | YES | TEAM | OWN |
| **Reports & Audit Logs** | | | | | | |
| View HR Analytics & Headcount Reports | `reports:hr` | NO | YES | YES | TEAM | NO |
| View Financial & Payroll Reports | `reports:payroll` | NO | YES | YES | NO | NO |
| Export Reports to CSV / PDF | `reports:export` | NO | YES | YES | TEAM | NO |
| View System Audit Logs | `audit_log:read` | YES | YES | NO | NO | NO |

---

## 3. Server-Side Enforcement Principle

All permissions are evaluated **server-side** on every REST endpoint and WebSocket gateway.
- The UI conditionally renders elements based on client-side state for UX clarity only.
- Direct API invocation bypassing UI controls is immediately blocked by NestJS `PermissionsGuard` and `TenantGuard` returning `HTTP 403 Forbidden`.
