import { Permission as P, UserRole } from '@seyyon/shared';

const selfService = [P.TENANT_READ, P.EMPLOYEE_READ, P.ATTENDANCE_RECORD,
  P.LEAVE_READ, P.LEAVE_APPLY, P.PAYROLL_READ_SELF, P.TASK_READ, P.TASK_CREATE,
  P.TASK_UPDATE, P.CHAT_ACCESS, P.MEETING_READ, P.MEETING_SCHEDULE];

// Team-wide approvals/reports are deliberately absent for managers until
// those handlers enforce reporting-line scope. Never infer them from role names.
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, readonly P[]> = {
  [UserRole.EMPLOYEE]: selfService,
  [UserRole.MANAGER]: [...selfService, P.PROJECT_MANAGE, P.CHAT_CREATE_CHANNEL],
  [UserRole.HR_ADMIN]: [...selfService, P.EMPLOYEE_CREATE, P.EMPLOYEE_UPDATE,
    P.EMPLOYEE_VIEW_SENSITIVE, P.EMPLOYEE_EXPORT, P.DEPARTMENT_MANAGE,
    P.DESIGNATION_MANAGE, P.ATTENDANCE_READ, P.ATTENDANCE_APPROVE,
    P.ATTENDANCE_IMPORT_BIOMETRIC, P.ATTENDANCE_MANAGE_SHIFTS, P.ATTENDANCE_EXPORT,
    P.LEAVE_APPROVE, P.LEAVE_MANAGE_POLICIES, P.PAYROLL_READ_ALL,
    P.PAYROLL_PROCESS, P.PAYROLL_FINALIZE, P.PAYROLL_MANAGE_STRUCTURES,
    P.REPORTS_HR, P.REPORTS_PAYROLL, P.REPORTS_EXPORT, P.CHAT_CREATE_CHANNEL],
  [UserRole.COMPANY_ADMIN]: Object.values(P).filter(p => ![
    P.TENANT_CREATE, P.TENANT_DELETE, P.TENANT_SUSPEND,
  ].includes(p)),
  [UserRole.PLATFORM_SUPER_ADMIN]: [P.TENANT_READ, P.TENANT_CREATE,
    P.TENANT_UPDATE, P.TENANT_SUSPEND, P.AUDIT_LOG_READ],
};

export function resolvePermissions(role: UserRole, rows: { permission: string }[]): string[] {
  // Explicit database grants take precedence; defaults cover unseeded roles.
  return rows.length ? [...new Set(rows.map(row => row.permission))]
    : [...(DEFAULT_ROLE_PERMISSIONS[role] || [])];
}
