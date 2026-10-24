import { describe, expect, it, vi } from 'vitest';
import { EmployeeStatus, EmploymentType } from '@seyyon/shared';
import { createEmployeesApi, employeeReadError, employeeTenantOptions } from './employees-api';
import { ApiError } from './auth-api';

const raw = {
  id: 'e', tenantId: 't', employeeCode: 'EMP-001', firstName: 'Test', lastName: 'Person', email: 'test@example.com',
  departmentId: 'd', designationId: 'j', managerId: 'm', avatarUrl: null,
  status: EmployeeStatus.PROBATION, employmentType: EmploymentType.FULL_TIME,
  dateOfJoining: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  department: { id: 'd', name: 'Engineering', code: 'ENG' }, designation: { id: 'j', title: 'Engineer', code: 'DEV' },
  manager: { id: 'm', firstName: 'Team', lastName: 'Lead' },
  address: 'private-address', bankAccount: 'private-account', unknownSecret: 'private-value',
};
const query = { search: '', departmentId: '', status: '' as const, page: 1, limit: 20 };

describe('Employees read API adapter', () => {
  it('posts an allowlisted import array and validates partial results with scoped headers', async () => {
    const request = vi.fn().mockResolvedValue({ total: 2, created: 1, failed: 1, invitationsPending: 1, errors: [{ row: 2, message: 'private database statement' }] });
    const input = { firstName: 'New', lastName: 'Person', email: 'NEW@example.com', departmentId: 'd', designationId: 'j' };
    const result = await createEmployeesApi(request, 't').importEmployees([input, { ...input, email: 'other@example.com' }]);
    expect(request.mock.calls[0][0]).toBe('/employees/bulk-import'); expect(request.mock.calls[0][1].method).toBe('POST'); expect(request.mock.calls[0][1].headers['X-Tenant-Id']).toBe('t');
    expect(JSON.parse(request.mock.calls[0][1].body)[0].email).toBe('new@example.com');
    expect(result.errors).toEqual([{ row: 2, message: 'Employee could not be imported' }]); expect(JSON.stringify(result)).not.toContain('private');
  });
  it.each([
    { total: 1, created: 1, failed: 1, invitationsPending: 0, errors: [{ row: 1, message: 'error' }] },
    { total: 1, created: 0, failed: 1, invitationsPending: 0, errors: [{ row: 2, message: 'error' }] },
    { total: 1, created: 1, failed: 0, invitationsPending: 2, errors: [] },
    { total: 1, created: 0, failed: 1, invitationsPending: 0, errors: [] },
  ])('rejects inconsistent import success responses %#', async response => {
    const request = vi.fn().mockResolvedValue(response);
    await expect(createEmployeesApi(request).importEmployees([{ firstName: 'New', lastName: 'Person', email: 'new@example.com', departmentId: 'd', designationId: 'j' }])).rejects.toThrow();
  });
  it('rejects empty or excessive import batches without requesting the server', async () => {
    const request = vi.fn(); const api = createEmployeesApi(request);
    await expect(api.importEmployees([])).rejects.toThrow(); await expect(api.importEmployees(Array(101).fill({}))).rejects.toThrow(); expect(request).not.toHaveBeenCalled();
  });
  it('uses the supported PUT endpoint with scoped headers and strips private response fields', async () => {
    const request = vi.fn().mockResolvedValue({ ...raw, dateOfExit: null, subordinates: [] });
    await createEmployeesApi(request, 't').update('e/slash', { firstName: ' Changed ', managerId: null, status: EmployeeStatus.RESIGNED });
    expect(request).toHaveBeenCalledWith('/employees/e%2Fslash', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 't' }, body: JSON.stringify({ firstName: 'Changed', managerId: null, status: 'RESIGNED' }) });
    await expect(createEmployeesApi(request).update('e', { email: 'unsupported@example.com' } as any)).rejects.toThrow(); expect(request).toHaveBeenCalledTimes(1);
  });
  it('retains only editable detail fields and relationships, excluding statutory and bank fields', async () => {
    const request = vi.fn().mockResolvedValue({ ...raw, dateOfExit: null, subordinates: [], phone: 'allowed-phone' });
    const result = await createEmployeesApi(request).editDetail('e');
    expect(result).toMatchObject({ departmentId: 'd', designationId: 'j', managerId: 'm', phone: 'allowed-phone', address: 'private-address' });
    expect(result).not.toHaveProperty('bankAccount'); expect(result).not.toHaveProperty('unknownSecret');
  });
  it('loads department-specific designations from the existing lookup contract', async () => {
    const request = vi.fn().mockResolvedValue([{ id: 'j', title: 'Engineer', code: 'DEV', departmentId: 'd', privateExtra: 'unused' }]);
    expect(await createEmployeesApi(request, 't').designations('d')).toEqual([{ id: 'j', title: 'Engineer', code: 'DEV', departmentId: 'd' }]);
    expect(request).toHaveBeenCalledWith('/departments/designations?departmentId=d', expect.objectContaining({ headers: { 'X-Tenant-Id': 't' } }));
  });
  it('only retains allowlisted creation response fields and rejects unknown invitation outcomes', async () => {
    const request = vi.fn().mockResolvedValue({ ...raw, activationInvitation: 'RETRY_REQUIRED' });
    const input = { firstName: 'Test', lastName: 'Person', email: 'TEST@example.com', departmentId: 'd', designationId: 'j' };
    const result = await createEmployeesApi(request).create(input);
    expect(result.activationInvitation).toBe('RETRY_REQUIRED'); expect(result).not.toHaveProperty('bankAccount');
    request.mockResolvedValue({ ...raw, activationInvitation: 'UNKNOWN' });
    await expect(createEmployeesApi(request).create(input)).rejects.toThrow();
  });
  it('uses the existing request mechanism, supported parameters, and nested response shapes', async () => {
    const request = vi.fn().mockResolvedValue({ items: [raw], pagination: { page: 2, limit: 10, total: 12, totalPages: 2 } });
    const signal = new AbortController().signal;
    const result = await createEmployeesApi(request).list({ ...query, page: 2, limit: 10, search: ' Test & Person ', departmentId: 'd', status: EmployeeStatus.PROBATION }, signal);
    const [path, init] = request.mock.calls[0]; const params = new URLSearchParams(path.split('?')[1]);
    expect(params.get('search')).toBe('Test & Person'); expect(params.get('departmentId')).toBe('d');
    expect(params.get('status')).toBe('PROBATION'); expect(params.get('page')).toBe('2'); expect(params.get('limit')).toBe('10');
    expect(params.has('pageSize')).toBe(false); expect(init).toEqual({ method: 'GET', signal });
    expect(result.items[0]).toMatchObject({ department: 'Engineering', designation: 'Engineer', manager: 'Team Lead', status: 'PROBATION' });
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 12, totalPages: 2 });
    expect(JSON.stringify(result)).not.toContain('private-');
  });

  it('omits empty filters and does not invent missing relationships or personal fields', async () => {
    const request = vi.fn().mockResolvedValue({ items: [{ ...raw, department: null, designation: null, manager: null }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    const result = await createEmployeesApi(request).list(query);
    expect(request.mock.calls[0][0]).toBe('/employees?page=1&limit=20');
    expect(result.items[0]).toMatchObject({ department: null, designation: null, manager: null, avatarUrl: null });
    expect(result.items[0]).not.toHaveProperty('phone');
  });

  it('fetches real details with an encoded ID and explicit platform tenant header', async () => {
    const request = vi.fn().mockResolvedValue({ ...raw, dateOfExit: null, subordinates: [], phone: 'private-phone' });
    const result = await createEmployeesApi(request, 'selected-tenant').detail('id/with slash');
    expect(request).toHaveBeenCalledWith('/employees/id%2Fwith%20slash', expect.objectContaining({ method: 'GET', headers: { 'X-Tenant-Id': 'selected-tenant' } }));
    expect(result.firstName).toBe('Test'); expect(result).not.toHaveProperty('phone'); expect(result).not.toHaveProperty('bankAccount');
  });

  it('uses the actual lookup endpoints and discards unused lookup fields', async () => {
    const request = vi.fn().mockResolvedValueOnce([{ id: 'd', name: 'Engineering', code: 'ENG', designations: [] }])
      .mockResolvedValueOnce([{ id: 't', name: 'Organization', status: 'ACTIVE', subscription: {} }]);
    expect(await createEmployeesApi(request).departments()).toEqual([{ id: 'd', name: 'Engineering', code: 'ENG' }]);
    expect(await employeeTenantOptions(request)).toEqual([{ id: 't', name: 'Organization', status: 'ACTIVE' }]);
    expect(request.mock.calls.map(call => call[0])).toEqual(['/departments', '/tenants/platform/all']);
  });

  it('rejects malformed successful responses instead of substituting an empty directory', async () => {
    const request = vi.fn().mockResolvedValue({ employees: [], count: 0 });
    await expect(createEmployeesApi(request).list(query)).rejects.toThrow();
  });

  it.each([400, 401, 403, 404, 500])('returns a safe visible message for HTTP %s', status => {
    expect(employeeReadError(new ApiError(status), 'profile')).toMatch(/invalid|session|permission|available|Unable/);
  });
});
