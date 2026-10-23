export enum Permission {
  // Tenant & Organization Management
  TENANT_READ = 'tenant:read',
  TENANT_CREATE = 'tenant:create',
  TENANT_UPDATE = 'tenant:update',
  TENANT_DELETE = 'tenant:delete',
  TENANT_SUSPEND = 'tenant:suspend',
  ORG_SETTINGS_MANAGE = 'org_settings:manage',

  // Employees & Lifecycle
  EMPLOYEE_READ = 'employee:read',
  EMPLOYEE_CREATE = 'employee:create',
  EMPLOYEE_UPDATE = 'employee:update',
  EMPLOYEE_DELETE = 'employee:delete',
  EMPLOYEE_VIEW_SENSITIVE = 'employee:view_sensitive',
  EMPLOYEE_EXPORT = 'employee:export',

  // Department & Designation
  DEPARTMENT_MANAGE = 'department:manage',
  DESIGNATION_MANAGE = 'designation:manage',

  // Attendance & Shifts
  ATTENDANCE_READ = 'attendance:read',
  ATTENDANCE_RECORD = 'attendance:record',
  ATTENDANCE_APPROVE = 'attendance:approve',
  ATTENDANCE_MANAGE_SHIFTS = 'attendance:manage_shifts',
  ATTENDANCE_IMPORT_BIOMETRIC = 'attendance:import_biometric',
  ATTENDANCE_EXPORT = 'attendance:export',

  // Leave Management
  LEAVE_READ = 'leave:read',
  LEAVE_APPLY = 'leave:apply',
  LEAVE_APPROVE = 'leave:approve',
  LEAVE_MANAGE_POLICIES = 'leave:manage_policies',

  // Payroll & Compensation
  PAYROLL_READ_SELF = 'payroll:read_self',
  PAYROLL_READ_ALL = 'payroll:read_all',
  PAYROLL_PROCESS = 'payroll:process',
  PAYROLL_APPROVE = 'payroll:approve',
  PAYROLL_FINALIZE = 'payroll:finalize',
  PAYROLL_MANAGE_STRUCTURES = 'payroll:manage_structures',

  // Tasks & Projects
  TASK_READ = 'task:read',
  TASK_CREATE = 'task:create',
  TASK_UPDATE = 'task:update',
  TASK_ASSIGN = 'task:assign',
  TASK_DELETE = 'task:delete',
  PROJECT_MANAGE = 'project:manage',

  // Chat & Communication
  CHAT_ACCESS = 'chat:access',
  CHAT_CREATE_CHANNEL = 'chat:create_channel',
  CHAT_MODERATE = 'chat:moderate',

  // Meetings & Calendar
  MEETING_READ = 'meeting:read',
  MEETING_SCHEDULE = 'meeting:schedule',
  MEETING_MANAGE = 'meeting:manage',

  // Documents
  DOCUMENT_READ = 'document:read',
  DOCUMENT_UPLOAD = 'document:upload',
  DOCUMENT_DELETE = 'document:delete',
  DOCUMENT_VIEW_CONFIDENTIAL = 'document:view_confidential',

  // Performance & Appraisals
  PERFORMANCE_READ = 'performance:read',
  PERFORMANCE_REVIEW = 'performance:review',
  PERFORMANCE_MANAGE_CYCLES = 'performance:manage_cycles',

  // Reports
  REPORTS_HR = 'reports:hr',
  REPORTS_PAYROLL = 'reports:payroll',
  REPORTS_EXPORT = 'reports:export',

  // Audit Logs & Security
  AUDIT_LOG_READ = 'audit_log:read',
  ROLES_MANAGE = 'roles:manage',
}
