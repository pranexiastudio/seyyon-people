import { Permission, UserRole } from '@seyyon/shared';
import { EmployeesService } from './employees.service';
import { employeeDirectorySelect } from './employee-response';

describe('Employee response privacy and tenant boundaries', () => {
  const privateValues = {
    phone: 'private-phone', gender: 'private-gender', dateOfBirth: new Date('1990-01-01'),
    address: 'private-address', emergencyContactName: 'private-contact', emergencyContactPhone: 'private-emergency-phone',
    panNumber: 'private-pan', aadharNumber: 'private-aadhaar', uanNumber: 'private-uan', bankAccount: 'private-account', bankIfsc: 'private-ifsc',
  };
  const record = () => ({
    id: 'e', tenantId: 't', employeeCode: 'EMP-001', firstName: 'Test', lastName: 'User', email: 'test@example.com',
    departmentId: 'd', designationId: 'j', managerId: 'm', employmentType: 'FULL_TIME', status: 'ACTIVE',
    dateOfJoining: new Date('2026-01-01'), createdAt: new Date(), updatedAt: new Date(), avatarUrl: null,
    ...privateValues, passwordHash: 'must-not-return', refreshTokenHash: 'must-not-return', futureSensitiveField: 'must-not-return',
    user: { passwordHash: 'must-not-return' },
    department: { id: 'd', tenantId: 't', name: 'Engineering', code: 'ENG', managerId: 'hidden' },
    designation: { id: 'j', tenantId: 't', title: 'Engineer', code: 'DEV', internalField: 'hidden' },
    manager: { id: 'm', tenantId: 't', firstName: 'Team', lastName: 'Manager', ...privateValues },
    subordinates: [{ id: 's', tenantId: 't', firstName: 'Team', lastName: 'Member', employeeCode: 'EMP-002', ...privateValues }],
  });
  let db: any, service: EmployeesService;
  beforeEach(() => {
    db = {
      employee: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([record()]),
        findFirst: jest.fn().mockResolvedValue(record()), update: jest.fn().mockResolvedValue(record()) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    db.$queryRaw = jest.fn().mockResolvedValue([]);
    db.user = { ...db.user, findFirst: jest.fn().mockResolvedValue(null) };
    db.$transaction = jest.fn(async callback => callback(db));
    service = new EmployeesService(db, {} as any);
  });
  const expectPrivateHidden = (response: any) => {
    for (const key of Object.keys(privateValues)) expect(response).not.toHaveProperty(key);
    for (const key of ['user', 'passwordHash', 'refreshTokenHash', 'futureSensitiveField']) expect(response).not.toHaveProperty(key);
    expect(JSON.stringify(response)).not.toContain('private-');
    expect(JSON.stringify(response)).not.toContain('must-not-return');
  };

  it('returns only an allowlisted directory and keeps the pagination envelope', async () => {
    const result = await service.findAll('t', { page: 2, limit: 10, search: 'Test', status: 'ACTIVE' as any });
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 1, totalPages: 1 });
    expectPrivateHidden(result.items[0]);
    expect(result.items[0].department).toEqual({ id: 'd', name: 'Engineering', code: 'ENG' });
    expect(result.items[0].manager).toEqual({ id: 'm', firstName: 'Team', lastName: 'Manager' });
    expect(db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 't', status: 'ACTIVE', OR: expect.any(Array) }), skip: 10, take: 10,
      select: employeeDirectorySelect,
    }));
    expect(db.employee.findMany.mock.calls[0][0].select).not.toHaveProperty('dateOfBirth');
  });

  it.each([UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.HR_ADMIN])('does not infer sensitive-read access from %s role', async role => {
    const result = await service.findById('t', 'e', { role, tenantId: 't', employeeId: 'another', permissions: [] });
    expectPrivateHidden(result);
    expect(result.subordinates).toEqual([{ id: 's', firstName: 'Team', lastName: 'Member', employeeCode: 'EMP-002' }]);
    expect(db.employee.findFirst.mock.calls[0][0].select).not.toHaveProperty('bankAccount');
  });

  it.each([
    { role: UserRole.EMPLOYEE, tenantId: 't', employeeId: 'e', permissions: [] },
    { role: UserRole.HR_ADMIN, tenantId: 't', permissions: [Permission.EMPLOYEE_VIEW_SENSITIVE] },
    { role: UserRole.MANAGER, tenantId: 't', permissions: [Permission.EMPLOYEE_VIEW_SENSITIVE] },
    { role: UserRole.COMPANY_ADMIN, tenantId: 't', permissions: [] },
    { role: UserRole.PLATFORM_SUPER_ADMIN, tenantId: null, permissions: [] },
  ])('allows verified self/granted/admin private access %# without exposing internal fields', async actor => {
    const result = await service.findById('t', 'e', actor);
    expect(result).toMatchObject(privateValues);
    expect(result).not.toHaveProperty('user'); expect(result).not.toHaveProperty('futureSensitiveField');
    expect(result.manager).not.toHaveProperty('bankAccount');
    expect(db.employee.findFirst.mock.calls[0][0].select.bankAccount).toBe(true);
  });

  it('does not allow a matching employee ID to bypass tenant identity', async () => {
    const result = await service.findById('t', 'e', { tenantId: 'foreign', employeeId: 'e', permissions: [Permission.EMPLOYEE_VIEW_SENSITIVE] });
    expectPrivateHidden(result);
  });

  it('uses tenant-scoped detail/update lookups and refuses missing or foreign records', async () => {
    db.employee.findFirst.mockResolvedValue(null);
    await expect(service.findById('t', 'foreign', {})).rejects.toMatchObject({ status: 404 });
    await expect(service.update('t', 'foreign', {}, {})).rejects.toMatchObject({ status: 404 });
    expect(db.employee.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign', tenantId: 't' } }));
    expect(db.employee.update).not.toHaveBeenCalled();
    await expect(service.findAll(undefined, { page: 1, limit: 20 })).rejects.toMatchObject({ status: 403 });
    await expect(service.findById(undefined, 'e', {})).rejects.toMatchObject({ status: 403 });
  });

  it('does not expose linked records from another tenant even if existing relationships are malformed', async () => {
    const row = record(); row.department.tenantId = 'foreign'; row.designation.tenantId = 'foreign';
    row.manager.tenantId = 'foreign'; row.subordinates[0].tenantId = 'foreign';
    db.employee.findFirst.mockResolvedValue(row);
    const result = await service.findById('t', 'e', { tenantId: 't' });
    expect(result.department).toBeNull(); expect(result.designation).toBeNull(); expect(result.manager).toBeNull();
    expect(result.subordinates).toEqual([]);
  });

  it.each([false, true])('filters update responses according to sensitive permission (%s)', async allowed => {
    const result = await service.update('t', 'e', { phone: 'new-phone' }, { tenantId: 't', permissions: allowed ? [Permission.EMPLOYEE_VIEW_SENSITIVE] : [] });
    if (allowed) expect(result).toMatchObject(privateValues); else expectPrivateHidden(result);
    expect(db.employee.update.mock.calls[0][0].where).toEqual({ id: 'e', tenantId: 't' });
  });
});
