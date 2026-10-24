import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Permission } from '@seyyon/shared';
import { EmployeesService } from './employees.service';
import { employeeConflictMessage } from './employee-errors';

describe('Employee mutation privacy and safe errors', () => {
  const dto: any = { firstName: 'Test', lastName: 'User', email: 'test@example.com', departmentId: 'd', designationId: 'j',
    employeeCode: 'EMP-001', panNumber: 'private-pan', bankAccount: 'private-bank', bankIfsc: 'private-ifsc' };
  const rawDatabaseError = (code = 'P2002') => Object.assign(new Error('Private database statement and submitted personal values'), {
    code, meta: { target: ['tenantId', 'email'], privateValue: 'private-bank' },
  });
  let db: any, service: EmployeesService, activation: any;
  beforeEach(() => {
    db = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ maxEmployees: 20, _count: { employees: 1 } }) },
      department: { findFirst: jest.fn().mockResolvedValue({ id: 'd' }) },
      designation: { findFirst: jest.fn().mockResolvedValue({ id: 'j' }) },
      employee: {
        findFirst: jest.fn(async ({ where }) => where.email ? null : { id: where.id, status: 'ACTIVE' }),
        create: jest.fn(async ({ data }) => ({ ...data, id: 'e', user: { passwordHash: 'private-hash' }, unknownSecret: 'private-secret' })),
        update: jest.fn(async ({ data }) => ({ ...data, id: 'e', tenantId: 't' })),
      },
      user: { create: jest.fn().mockResolvedValue({}) }, auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    db.$transaction = jest.fn(callback => callback(db));
    activation = { invite: jest.fn().mockResolvedValue({}) };
    db.$queryRaw = jest.fn().mockResolvedValue([]);
    db.user = { ...db.user, findFirst: jest.fn().mockResolvedValue(null) };
    db.$transaction = jest.fn(async callback => callback(db));
    service = new EmployeesService(db, activation);
  });

  it.each([false, true])('allowlists create responses and requires sensitive permission (%s)', async allowed => {
    const result = await service.create('t', dto, { tenantId: 't', permissions: allowed ? [Permission.EMPLOYEE_VIEW_SENSITIVE] : [] });
    expect(result.activationInvitation).toBe('SENT'); expect(result.email).toBe(dto.email);
    if (allowed) expect(result.bankAccount).toBe(dto.bankAccount); else {
      for (const key of ['bankAccount', 'panNumber', 'bankIfsc', 'phone', 'address']) expect(result).not.toHaveProperty(key);
    }
    expect(result).not.toHaveProperty('user'); expect(result).not.toHaveProperty('unknownSecret');
    expect(db.employee.create.mock.calls[0][0].select.bankAccount).toBe(allowed ? true : undefined);
  });

  it('maps prechecked employee email conflicts to generic 409 without reflecting the address', async () => {
    db.employee.findFirst.mockResolvedValue({ id: 'duplicate' });
    await expect(service.create('t', dto, {})).rejects.toMatchObject({ status: 409, message: employeeConflictMessage });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(['employee-email', 'employee-code', 'linked-user-email'])('maps %s uniqueness failures to 409, including transaction races', async source => {
    const model = source === 'linked-user-email' ? db.user : db.employee;
    const error = rawDatabaseError(); error.meta.target = source === 'employee-code' ? ['tenantId', 'employeeCode'] : ['email'];
    model.create.mockRejectedValueOnce(error);
    await expect(service.create('t', dto, {})).rejects.toMatchObject({ status: 409, message: employeeConflictMessage });
    expect(db.auditLog.create).not.toHaveBeenCalled(); expect(activation.invite).not.toHaveBeenCalled();
  });

  it('maps unexpected provisioning failures to safe 500 without database diagnostics', async () => {
    db.user.create.mockRejectedValueOnce(rawDatabaseError('P_UNKNOWN'));
    await expect(service.create('t', dto, {})).rejects.toMatchObject({ status: 500, message: 'Employee operation could not be completed' });
  });

  it.each([
    ['P2002', 409, employeeConflictMessage],
    ['P2003', 400, 'Invalid employee organization relationships'],
    ['P2025', 404, 'Employee not found in this organization'],
  ])('maps update database failure %s to a controlled response', async (code, status, message) => {
    db.employee.update.mockRejectedValueOnce(rawDatabaseError(code as string));
    await expect(service.update('t', 'e', {}, {})).rejects.toMatchObject({ status, message });
  });

  it('returns safe row errors and counts without reflecting submitted values or exceptions', async () => {
    const errors = [rawDatabaseError(), rawDatabaseError('P_UNKNOWN'), new BadRequestException('private submitted address'),
      new ForbiddenException('private submitted bank'), new NotFoundException('private identifier'), new ConflictException('private email')];
    const create = jest.spyOn(service, 'create'); errors.forEach(error => create.mockRejectedValueOnce(error));
    const result = await service.importBulk('t', errors.map(() => dto), {});
    expect(result).toMatchObject({ total: 6, created: 0, failed: 6, invitationsPending: 0 });
    expect(result.errors).toEqual([
      { row: 1, message: employeeConflictMessage },
      { row: 2, message: 'Employee could not be imported' },
      { row: 3, message: 'Invalid employee data or organization relationships' },
      { row: 4, message: 'Employee operation not permitted or organization seat limit reached' },
      { row: 5, message: 'Employee or organization not found' },
      { row: 6, message: employeeConflictMessage },
    ]);
    expect(JSON.stringify(result)).not.toContain('private'); expect(JSON.stringify(result)).not.toContain(dto.email);
    result.errors.forEach(error => expect(Object.keys(error).sort()).toEqual(['message', 'row']));
  });

  it('preserves mixed import outcomes and invitation retry counts', async () => {
    jest.spyOn(service, 'create').mockResolvedValueOnce({ activationInvitation: 'RETRY_REQUIRED' } as any)
      .mockRejectedValueOnce(rawDatabaseError()).mockResolvedValueOnce({ activationInvitation: 'SENT' } as any);
    const result = await service.importBulk('t', [dto, dto, dto], {});
    expect(result).toMatchObject({ total: 3, created: 2, failed: 1, invitationsPending: 1 });
    expect(result.errors).toEqual([{ row: 2, message: employeeConflictMessage }]);
  });
});
