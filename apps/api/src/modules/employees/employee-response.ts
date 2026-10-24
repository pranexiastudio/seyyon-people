import { Department, Designation, Employee, Prisma } from '@prisma/client';
import { Permission, UserRole } from '@seyyon/shared';

export interface EmployeeActor {
  id?: string;
  email?: string;
  tenantId?: string | null;
  employeeId?: string | null;
  role?: string;
  permissions?: readonly string[];
}

export const employeeDirectorySelect = {
  id: true, tenantId: true, employeeCode: true, firstName: true, lastName: true,
  email: true, avatarUrl: true, departmentId: true, designationId: true, managerId: true,
  employmentType: true, status: true, dateOfJoining: true, createdAt: true, updatedAt: true,
  department: { select: { id: true, tenantId: true, name: true, code: true } },
  designation: { select: { id: true, tenantId: true, title: true, code: true } },
  manager: { select: { id: true, tenantId: true, firstName: true, lastName: true } },
} satisfies Prisma.EmployeeSelect;

const privateSelect = {
  phone: true, gender: true, dateOfBirth: true, address: true,
  emergencyContactName: true, emergencyContactPhone: true,
  panNumber: true, aadharNumber: true, uanNumber: true, bankAccount: true, bankIfsc: true,
} satisfies Prisma.EmployeeSelect;

export function canViewEmployeePrivate(actor: EmployeeActor, tenantId: string, employeeId?: string): boolean {
  if (actor?.role === UserRole.PLATFORM_SUPER_ADMIN) return true;
  if (!tenantId || actor?.tenantId !== tenantId) return false;
  return actor.role === UserRole.COMPANY_ADMIN
    || (!!employeeId && actor.employeeId === employeeId)
    || !!actor.permissions?.includes(Permission.EMPLOYEE_VIEW_SENSITIVE);
}

export function employeeDetailsSelect(includePrivate: boolean, tenantId: string) {
  return {
    ...employeeDirectorySelect, dateOfExit: true,
    ...(includePrivate ? privateSelect : {}),
    subordinates: { where: { tenantId }, select: { id: true, tenantId: true, firstName: true, lastName: true, employeeCode: true } },
  } satisfies Prisma.EmployeeSelect;
}

type EmployeeSource = Partial<Employee> & {
  department?: Partial<Department> | null;
  designation?: Partial<Designation> | null;
  manager?: Partial<Employee> | null;
  subordinates?: Partial<Employee>[];
};

export interface EmployeeDirectoryResponse {
  id: string; tenantId: string; employeeCode: string; firstName: string; lastName: string;
  email: string; avatarUrl: string | null; departmentId: string; designationId: string;
  managerId: string | null; employmentType: Employee['employmentType']; status: Employee['status'];
  dateOfJoining: Date; createdAt: Date; updatedAt: Date;
  department: { id: string; name: string; code: string } | null;
  designation: { id: string; title: string; code: string } | null;
  manager: { id: string; firstName: string; lastName: string } | null;
}

export interface EmployeeDetailsResponse extends EmployeeDirectoryResponse {
  dateOfExit: Date | null;
  subordinates: { id: string; firstName: string; lastName: string; employeeCode: string }[];
  phone?: string | null; gender?: string | null; dateOfBirth?: Date | null; address?: string | null;
  emergencyContactName?: string | null; emergencyContactPhone?: string | null;
  panNumber?: string | null; aadharNumber?: string | null; uanNumber?: string | null;
  bankAccount?: string | null; bankIfsc?: string | null;
}

// Explicit projection is deliberate: even an over-broad mock/query or a new
// Prisma model field must never implicitly become part of the public contract.
export function employeeDirectoryResponse(employee: EmployeeSource): EmployeeDirectoryResponse {
  const department = employee.department?.tenantId === employee.tenantId ? employee.department : null;
  const designation = employee.designation?.tenantId === employee.tenantId ? employee.designation : null;
  const manager = employee.manager?.tenantId === employee.tenantId ? employee.manager : null;
  return {
    id: employee.id, tenantId: employee.tenantId, employeeCode: employee.employeeCode,
    firstName: employee.firstName, lastName: employee.lastName, email: employee.email,
    avatarUrl: employee.avatarUrl, departmentId: employee.departmentId, designationId: employee.designationId,
    managerId: employee.managerId, employmentType: employee.employmentType, status: employee.status,
    dateOfJoining: employee.dateOfJoining, createdAt: employee.createdAt, updatedAt: employee.updatedAt,
    department: department ? { id: department.id, name: department.name, code: department.code } : null,
    designation: designation ? { id: designation.id, title: designation.title, code: designation.code } : null,
    manager: manager ? { id: manager.id, firstName: manager.firstName, lastName: manager.lastName } : null,
  };
}

export function employeeDetailsResponse(employee: EmployeeSource, includePrivate: boolean): EmployeeDetailsResponse {
  const response: EmployeeDetailsResponse = {
    ...employeeDirectoryResponse(employee), dateOfExit: employee.dateOfExit ?? null,
    subordinates: (employee.subordinates || []).filter(row => row.tenantId === employee.tenantId)
      .map(row => ({ id: row.id, firstName: row.firstName, lastName: row.lastName, employeeCode: row.employeeCode })),
  };
  if (includePrivate) {
    Object.assign(response, {
      phone: employee.phone, gender: employee.gender, dateOfBirth: employee.dateOfBirth,
      address: employee.address, emergencyContactName: employee.emergencyContactName,
      emergencyContactPhone: employee.emergencyContactPhone, panNumber: employee.panNumber,
      aadharNumber: employee.aadharNumber, uanNumber: employee.uanNumber,
      bankAccount: employee.bankAccount, bankIfsc: employee.bankIfsc,
    });
  }
  return response;
}
