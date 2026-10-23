import { UserRole, EmploymentType, EmployeeStatus } from '../enums/role.enum';
import {
  AttendanceStatus,
  LeaveType,
  LeaveStatus,
  PayrollStatus,
  SalaryComponentType,
  TaskStatus,
  TaskPriority,
  PlanTier,
  SubscriptionStatus,
} from '../enums/hrms.enum';
import { Permission } from '../enums/permission.enum';

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  planTier: PlanTier;
  isActive: boolean;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  permissions: Permission[];
  tenantId: string | null; // null for PLATFORM_SUPER_ADMIN
  employeeId?: string | null;
  avatarUrl?: string | null;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  planTier: PlanTier;
  status: SubscriptionStatus;
  employeeCount: number;
  maxEmployees: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeSummary {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  departmentId: string;
  departmentName: string;
  designationId: string;
  designationTitle: string;
  managerId?: string | null;
  managerName?: string | null;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  dateOfJoining: string;
  tenantId: string;
}

export interface DashboardMetrics {
  totalEmployees: number;
  activeEmployees: number;
  departmentsCount: number;
  attendanceToday: {
    present: number;
    absent: number;
    late: number;
    onLeave: number;
  };
  pendingApprovals: {
    leaveRequests: number;
    attendanceCorrections: number;
    pendingTasks: number;
  };
  upcomingMeetingsCount: number;
  payrollStatus?: {
    currentPeriod: string;
    status: PayrollStatus;
    totalGrossPay?: number;
    totalNetPay?: number;
  };
}

export interface BiometricPunchRecord {
  deviceEmployeeCode: string;
  timestamp: string; // ISO string
  punchType: 'CHECK_IN' | 'CHECK_OUT';
  deviceId: string;
  deviceIp?: string;
  rawPayload?: string;
}

export interface BiometricImportResult {
  totalProcessed: number;
  successfulPunches: number;
  failedPunches: number;
  duplicatesSkipped: number;
  errors: Array<{ line: number; message: string; data?: any }>;
}

export interface IndianStatutoryDeductionBreakdown {
  basicSalary: number;
  dearnessAllowance: number;
  pfGrossSalary: number; // Basic + DA
  employeePfDeduction: number; // 12% subject to cap or rules
  employerPfContribution: number;
  esiEligibleGross: number;
  employeeEsiDeduction: number; // 0.75% if gross <= 21000
  employerEsiContribution: number; // 3.25%
  professionalTax: number; // State-based slab deduction
  incomeTaxTds: number; // Monthly projected tax
  totalStatutoryDeductions: number;
}
