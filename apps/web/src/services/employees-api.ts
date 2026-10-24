import { z } from 'zod';
import { EmployeeStatus, EmploymentType } from '@seyyon/shared';
import type { AuthSession } from './auth-session';
import { ApiError } from './auth-api';

// Parse only the documented read contract. Unknown fields (including private
// detail fields) are deliberately discarded before entering directory caches.
const directoryEmployee = z.object({
  id: z.string(), tenantId: z.string(), employeeCode: z.string(), firstName: z.string(), lastName: z.string(),
  email: z.string(), avatarUrl: z.string().nullable(), departmentId: z.string(), designationId: z.string(), managerId: z.string().nullable(),
  employmentType: z.nativeEnum(EmploymentType), status: z.nativeEnum(EmployeeStatus),
  dateOfJoining: z.string().datetime({ offset: true }), createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
  department: z.object({ id: z.string(), name: z.string(), code: z.string() }).nullable(),
  designation: z.object({ id: z.string(), title: z.string(), code: z.string() }).nullable(),
  manager: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }).nullable(),
});
const detailEmployee = directoryEmployee.extend({
  dateOfExit: z.string().datetime({ offset: true }).nullable(),
  subordinates: z.array(z.object({ id: z.string(), firstName: z.string(), lastName: z.string(), employeeCode: z.string() })),
});
const editableDetails = detailEmployee.extend({ phone: z.string().nullable().optional(), address: z.string().nullable().optional(),
  emergencyContactName: z.string().nullable().optional(), emergencyContactPhone: z.string().nullable().optional() });
export const employeeUpdateSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').optional(),
  lastName: z.string().trim().min(1, 'Last name is required.').optional(),
  departmentId: z.string().min(1, 'Select a department.').optional(),
  designationId: z.string().min(1, 'Select a designation.').optional(),
  managerId: z.string().min(1).nullable().optional(), status: z.nativeEnum(EmployeeStatus).optional(),
  phone: z.string().trim().optional(), address: z.string().trim().optional(),
  emergencyContactName: z.string().trim().optional(), emergencyContactPhone: z.string().trim().optional(),
}).strict();
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type EmployeeEditDetails = z.infer<typeof editableDetails>;
const paginationSchema = z.object({ page: z.number().int().min(1).max(1000000), limit: z.number().int().min(1).max(100), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() });
const listSchema = z.object({ items: z.array(directoryEmployee), pagination: paginationSchema });
const departmentSchema = z.array(z.object({ id: z.string(), name: z.string(), code: z.string() }));
const tenantSchema = z.array(z.object({ id: z.string(), name: z.string(), status: z.string() }));
const designationSchema = z.array(z.object({ id: z.string(), title: z.string(), code: z.string(), departmentId: z.string().nullable() }));
const optionalText = z.string().trim().optional().transform(value => value || undefined);
export const employeeCreateSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.'),
  lastName: z.string().trim().min(1, 'Last name is required.'),
  email: z.string().trim().email('Enter a valid work email.').transform(value => value.toLowerCase()),
  departmentId: z.string().min(1, 'Select a department.'),
  designationId: z.string().min(1, 'Select a designation.'),
  employeeCode: optionalText, phone: optionalText, managerId: optionalText,
  employmentType: z.nativeEnum(EmploymentType).optional(),
  dateOfJoining: optionalText.refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value), 'Enter a valid joining date.'),
});
const creationSchema = z.object({ id: z.string().min(1), employeeCode: z.string(), firstName: z.string(), lastName: z.string(),
  email: z.string(), activationInvitation: z.enum(['SENT', 'RETRY_REQUIRED']) });
export type EmployeeCreateInput = z.input<typeof employeeCreateSchema>;
const importResultSchema = z.object({ total: z.number().int().nonnegative(), created: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
  invitationsPending: z.number().int().nonnegative(), errors: z.array(z.object({ row: z.number().int().min(1), message: z.string() })) });
export type EmployeeImportResult = z.infer<typeof importResultSchema>;
const safeImportMessages = ['Employee email or code conflicts with an existing record', 'Invalid employee data or organization relationships',
  'Employee operation not permitted or organization seat limit reached', 'Employee or organization not found', 'Employee could not be imported'];
export type EmployeeCreated = z.infer<typeof creationSchema>;
export type DesignationOption = z.infer<typeof designationSchema>[number];

export interface EmployeeListQuery { search: string; departmentId: string; status: EmployeeStatus | ''; page: number; limit: number }
export type EmployeeRow = ReturnType<typeof toEmployeeRow>;
export type EmployeeProfile = EmployeeRow & { dateOfExit: string | null; subordinates: z.infer<typeof detailEmployee>['subordinates'] };
export type EmployeeDirectory = { items: EmployeeRow[]; pagination: z.infer<typeof paginationSchema> };
export type DepartmentOption = z.infer<typeof departmentSchema>[number];
export type TenantOption = z.infer<typeof tenantSchema>[number];

function toEmployeeRow(employee: z.infer<typeof directoryEmployee>) {
  return {
    id: employee.id, employeeCode: employee.employeeCode, firstName: employee.firstName, lastName: employee.lastName,
    email: employee.email, avatarUrl: employee.avatarUrl, status: employee.status, employmentType: employee.employmentType,
    dateOfJoining: employee.dateOfJoining,
    department: employee.department?.name ?? null, designation: employee.designation?.title ?? null,
    manager: employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}`.trim() : null,
  };
}

export function createEmployeesApi(request: AuthSession['request'], tenantId?: string) {
  const get = <T,>(path: string, signal?: AbortSignal) => request<T>(path, {
    method: 'GET', signal, ...(tenantId ? { headers: { 'X-Tenant-Id': tenantId } } : {}),
  });
  const post = (path: string, body: object) => request<unknown>(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}) },
    body: JSON.stringify(body),
  });
  return {
    async editDetail(id: string, signal?: AbortSignal): Promise<EmployeeEditDetails> {
      return editableDetails.parse(await get<unknown>(`/employees/${encodeURIComponent(id)}`, signal));
    },
    async update(id: string, input: EmployeeUpdateInput): Promise<void> {
      detailEmployee.parse(await request<unknown>(`/employees/${encodeURIComponent(id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}) },
        body: JSON.stringify(employeeUpdateSchema.parse(input)),
      }));
    },
    async importEmployees(rows: EmployeeCreateInput[]): Promise<EmployeeImportResult> {
      if (!rows.length || rows.length > 100) throw new Error('Import requires 1 to 100 rows.');
      const payload = rows.map(row => employeeCreateSchema.parse(row));
      if (new Blob([JSON.stringify(payload)]).size > 65536) throw new Error('Import payload is too large.');
      const result = importResultSchema.parse(await post('/employees/bulk-import', payload));
      const indices = new Set(result.errors.map(error => error.row));
      if (result.total !== rows.length || result.created + result.failed !== result.total || result.failed !== result.errors.length
        || indices.size !== result.errors.length || result.errors.some(error => error.row > result.total) || result.invitationsPending > result.created) {
        throw new Error('Import result could not be verified.');
      }
      return { ...result, errors: result.errors.map(error => ({ row: error.row, message: safeImportMessages.includes(error.message) ? error.message : 'Employee could not be imported' })) };
    },
    async create(input: EmployeeCreateInput): Promise<EmployeeCreated> {
      return creationSchema.parse(await post('/employees', employeeCreateSchema.parse(input)));
    },
    async resendInvitation(id: string): Promise<void> {
      z.object({ message: z.string().min(1) }).parse(await post(`/employees/${encodeURIComponent(id)}/activation-invitation`, {}));
    },
    async designations(departmentId?: string, signal?: AbortSignal): Promise<DesignationOption[]> {
      return designationSchema.parse(await get<unknown>(`/departments/designations${departmentId ? '?' + new URLSearchParams({ departmentId }) : ''}`, signal));
    },
    async list(query: EmployeeListQuery, signal?: AbortSignal): Promise<EmployeeDirectory> {
      const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
      if (query.search.trim()) params.set('search', query.search.trim());
      if (query.departmentId) params.set('departmentId', query.departmentId);
      if (query.status) params.set('status', query.status);
      const data = listSchema.parse(await get<unknown>(`/employees?${params}`, signal));
      return { items: data.items.map(toEmployeeRow), pagination: data.pagination };
    },
    async detail(id: string, signal?: AbortSignal): Promise<EmployeeProfile> {
      const data = detailEmployee.parse(await get<unknown>(`/employees/${encodeURIComponent(id)}`, signal));
      return { ...toEmployeeRow(data), dateOfExit: data.dateOfExit, subordinates: data.subordinates };
    },
    async departments(signal?: AbortSignal): Promise<DepartmentOption[]> {
      return departmentSchema.parse(await get<unknown>('/departments', signal));
    },
  };
}

export function employeeWriteError(error: unknown, action: 'create' | 'invite'): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has ended. Please sign in again.';
    if (error.status === 403) return action === 'create'
      ? 'Creation is not allowed. Check your permissions and the organization seat limit.'
      : 'You do not have permission to send this invitation.';
    if (error.status === 409) return 'Employee email or code conflicts with an existing record. Check both fields.';
    if (error.status === 400 || error.status === 404) return action === 'create'
      ? 'The employee data or organization relationships are invalid. Check the form and reload the choices.'
      : 'This account is not eligible for an invitation. It may already be active or no longer pending.';
    if (error.status === 429) return 'Too many invitation attempts. Wait at least one minute; an hourly limit may also apply.';
    if (error.status === 503 && action === 'invite') return 'The invitation could not be sent. The employee account still exists. Wait before retrying.';
  }
  return action === 'create'
    ? 'Creation could not be confirmed. Check the directory before trying again; an account may already exist.'
    : 'Invitation delivery could not be confirmed. The employee account still exists. Wait before retrying.';
}

export async function employeeTenantOptions(request: AuthSession['request'], signal?: AbortSignal): Promise<TenantOption[]> {
  return tenantSchema.parse(await request<unknown>('/tenants/platform/all', { method: 'GET', signal }));
}

export function employeeReadError(error: unknown, resource: 'employees' | 'profile' | 'departments' | 'organizations'): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'The search or filters are invalid. Adjust them and try again.';
    if (error.status === 401) return 'Your session has ended. Please sign in again.';
    if (error.status === 403) return `You do not have permission to view these ${resource === 'profile' ? 'employee details' : resource}.`;
    if (error.status === 404 && resource === 'profile') return 'This employee profile is no longer available.';
  }
  if (error instanceof z.ZodError) return `The server returned an invalid ${resource} response. Please retry.`;
  return `Unable to load ${resource === 'profile' ? 'employee profile' : resource}. Please retry.`;
}

export function employeeUpdateError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'Invalid employee data or reporting relationships. Check the form and reload the choices.';
    if (error.status === 401) return 'Your session has ended. Please sign in again.';
    if (error.status === 403) return 'You do not have permission to update this employee.';
    if (error.status === 404) return 'This employee is no longer available in this organization.';
    if (error.status === 409) return 'The employee or linked account changed or conflicts with an existing record. Reload before retrying.';
  }
  return 'The update could not be confirmed. Close and reload the employee before trying again.';
}

export function employeeImportError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'The server rejected the import request. Check the template, required fields and batch size.';
    if (error.status === 401) return 'Your session has ended. Sign in again and check the directory before retrying.';
    if (error.status === 403) return 'Import is not permitted. Check your permissions and organization access.';
    if (error.status === 413) return 'The server rejected the file size. Split the CSV into smaller batches.';
    if (error.status === 409) return 'The import conflicts with existing records. Check the directory before retrying.';
  }
  return 'Import outcome is unconfirmed. Some accounts may already exist. Check the directory before retrying; do not submit this batch again automatically.';
}
