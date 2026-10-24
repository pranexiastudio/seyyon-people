import { ValidationPipe } from '@nestjs/common';
import { UpdateEmployeeDto } from './dto/create-employee.dto';
import { EmployeesService } from './employees.service';

describe('Employee editing and linked-account lifecycle (mocked transactional database)', () => {
  let db: any, service: EmployeesService, employee: any, user: any, token: any;
  beforeEach(() => {
    employee = { id: 'e', tenantId: 't', status: 'ACTIVE', departmentId: 'd', designationId: 'j', managerId: null, firstName: 'Old', lastName: 'Name' };
    user = { id: 'u', tenantId: 't', employeeId: 'e', isActive: true, activationPending: false, refreshTokenHash: 'test-hash' };
    token = { tenantId: 't', userId: 'u', consumedAt: null };
    db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      employee: {
        findFirst: jest.fn(async ({ where }) => where.id === employee.id && where.tenantId === employee.tenantId ? { ...employee } : null),
        update: jest.fn(async ({ data }) => { for (const key of Object.keys(data)) if (data[key] !== undefined) employee[key] = data[key]; return { ...employee }; }),
      },
      department: { findFirst: jest.fn(async ({ where }) => where.id === 'd' && where.tenantId === 't' ? { id: 'd' } : null) },
      designation: { findFirst: jest.fn(async ({ where }) => where.id === 'j' && where.tenantId === 't' ? { id: 'j', departmentId: 'd' } : null) },
      user: {
        findFirst: jest.fn(async ({ where }) => user && user.employeeId === where.employeeId && user.tenantId === where.tenantId ? { id: user.id } : null),
        updateMany: jest.fn(async ({ where, data }) => {
          if (!user || where.id !== user.id || where.tenantId !== user.tenantId || where.employeeId !== user.employeeId) return { count: 0 };
          for (const key of Object.keys(data)) if (data[key] !== undefined) user[key] = data[key]; return { count: 1 };
        }),
      },
      employeeActivationToken: { updateMany: jest.fn(async ({ where, data }) => { if (where.userId === token.userId && where.tenantId === token.tenantId) token.consumedAt = data.consumedAt; return { count: 1 }; }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    db.$transaction = jest.fn(async callback => {
      const before = structuredClone({ employee, user, token });
      try { return await callback(db); } catch (error) { ({ employee, user, token } = before); throw error; }
    });
    service = new EmployeesService(db, {} as any);
  });
  it.each(['TERMINATED', 'RESIGNED'])('atomically disables only the exact linked account for %s', async status => {
    await service.update('t', 'e', { status } as any, {});
    expect(employee.status).toBe(status); expect(user.isActive).toBe(false); expect(user.refreshTokenHash).toBeNull(); expect(token.consumedAt).toBeInstanceOf(Date);
    expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u', tenantId: 't', employeeId: 'e' }, data: expect.objectContaining({ isActive: false, refreshTokenHash: null }) });
    expect(db.employeeActivationToken.updateMany).toHaveBeenCalledWith({ where: { userId: 'u', tenantId: 't', consumedAt: null }, data: { consumedAt: expect.any(Date) } });
    expect(db.employee.update.mock.calls[0][0].where).toEqual({ id: 'e', tenantId: 't' });
    const locks = db.$queryRaw.mock.calls.map(([parts]) => parts.join('?'));
    expect(locks[0]).toContain('"User"'); expect(locks[1]).toContain('"Employee"');
  });
  it.each(['ACTIVE', 'PROBATION', 'NOTICE_PERIOD'])('preserves pending accounts for %s', async status => {
    employee.status = 'TERMINATED'; user.isActive = false; user.activationPending = true;
    await service.update('t', 'e', { status } as any, {});
    expect(user.isActive).toBe(false); expect(user.activationPending).toBe(true); expect(db.user.updateMany).not.toHaveBeenCalled();
  });
  it('preserves manually disabled access when returning to active employment and editing names', async () => {
    employee.status = 'RESIGNED'; user.isActive = false; user.activationPending = false;
    await service.update('t', 'e', { firstName: 'Updated', status: 'ACTIVE' as any }, {});
    expect(employee.status).toBe('ACTIVE'); expect(user.firstName).toBe('Updated'); expect(user.isActive).toBe(false); expect(user.activationPending).toBe(false);
  });
  it('preserves access during notice and synchronizes names without changing account security fields', async () => {
    await service.update('t', 'e', { firstName: 'Updated', status: 'NOTICE_PERIOD' as any }, {});
    expect(user.firstName).toBe('Updated'); expect(user.isActive).toBe(true); expect(user.refreshTokenHash).toBe('test-hash');
    expect(db.user.updateMany.mock.calls[0][0].data).not.toHaveProperty('passwordHash');
    expect(db.user.updateMany.mock.calls[0][0].data).not.toHaveProperty('role');
  });
  it('does not disable another tenant account even with a malformed existing employee linkage', async () => {
    user.tenantId = 'foreign'; await service.update('t', 'e', { status: 'RESIGNED' as any }, {});
    expect(user.isActive).toBe(true); expect(db.user.updateMany).not.toHaveBeenCalled(); expect(db.employeeActivationToken.updateMany).not.toHaveBeenCalled();
  });
  it('supports employees without linked users', async () => {
    user = null; await service.update('t', 'e', { status: 'RESIGNED' as any }, {});
    expect(employee.status).toBe('RESIGNED'); expect(db.user.updateMany).not.toHaveBeenCalled();
  });
  it('rolls back the employment change when account disable fails and sanitizes the error', async () => {
    db.user.updateMany.mockRejectedValue(new Error('private storage details'));
    await expect(service.update('t', 'e', { status: 'TERMINATED' as any }, {})).rejects.toMatchObject({ status: 500, message: 'Employee operation could not be completed' });
    expect(employee.status).toBe('ACTIVE'); expect(user.isActive).toBe(true); expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it('rolls back when pending invitation invalidation fails', async () => {
    db.employeeActivationToken.updateMany.mockRejectedValue(new Error('storage failed'));
    await expect(service.update('t', 'e', { status: 'RESIGNED' as any }, {})).rejects.toMatchObject({ status: 500 });
    expect(employee.status).toBe('ACTIVE'); expect(user.isActive).toBe(true);
  });
  it('refuses an account link changed during the write', async () => {
    db.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.update('t', 'e', { firstName: 'Changed' }, {})).rejects.toMatchObject({ status: 409 }); expect(employee.firstName).toBe('Old');
  });
  it('rejects another tenant employee before any write', async () => {
    await expect(service.update('other', 'e', { status: 'RESIGNED' as any }, {})).rejects.toMatchObject({ status: 404 });
    expect(db.employee.update).not.toHaveBeenCalled(); expect(db.user.updateMany).not.toHaveBeenCalled();
  });
  it.each(['departmentId', 'designationId', 'managerId'])('rejects invalid %s without mutation', async field => {
    await expect(service.update('t', 'e', { [field]: 'foreign' }, {})).rejects.toMatchObject({ status: 400 }); expect(db.employee.update).not.toHaveBeenCalled();
  });
  it('validates the resulting designation and department even for partial updates', async () => {
    db.department.findFirst.mockResolvedValue({ id: 'other-dept' });
    await expect(service.update('t', 'e', { departmentId: 'other-dept' }, {})).rejects.toMatchObject({ status: 400 }); expect(db.employee.update).not.toHaveBeenCalled();
    db.designation.findFirst.mockResolvedValue({ id: 'global', departmentId: null });
    await expect(service.update('t', 'e', { designationId: 'global' }, {})).resolves.toMatchObject({ designationId: 'global' });
  });
  it('supports clearing a manager and rejects direct self-management', async () => {
    employee.managerId = 'manager'; await service.update('t', 'e', { managerId: null }, {}); expect(employee.managerId).toBeNull();
    await expect(service.update('t', 'e', { managerId: 'e' }, {})).rejects.toMatchObject({ status: 400 });
    expect(db.$queryRaw.mock.calls.some(([parts]) => parts.join('').includes('"Tenant"'))).toBe(true);
  });
  it('rejects a manager whose chain contains the employee or an existing cycle', async () => {
    db.employee.findFirst.mockImplementation(async ({ where }) => where.id === 'e' ? { ...employee } : { id: where.id, managerId: 'e' });
    await expect(service.update('t', 'e', { managerId: 'subordinate' }, {})).rejects.toMatchObject({ status: 400 }); expect(db.employee.update).not.toHaveBeenCalled();
  });
  it('accepts a valid same-tenant manager chain', async () => {
    db.employee.findFirst.mockImplementation(async ({ where }) => where.id === 'e' ? { ...employee } : { id: where.id, managerId: null });
    await expect(service.update('t', 'e', { managerId: 'manager' }, {})).resolves.toMatchObject({ managerId: 'manager' });
  });
});

describe('Employee update runtime validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validate = (value: object) => pipe.transform(value, { type: 'body', metatype: UpdateEmployeeDto });
  it('accepts supported fields and null manager removal', async () => {
    await expect(validate({ firstName: ' New ', managerId: null, status: 'PROBATION' })).resolves.toMatchObject({ firstName: 'New', managerId: null });
  });
  it.each([{ firstName: '' }, { firstName: '  ' }, { lastName: null }, { departmentId: null }, { designationId: [] }, { managerId: {} }, { status: 'DISABLED' }, { status: null }, { email: 'changed@example.com' }, { tenantId: 'other' }, { isActive: true }])('rejects malformed/unsupported updates %#', async body => {
    await expect(validate(body)).rejects.toMatchObject({ status: 400 });
  });
});
