import { EmployeesService } from './employees.service';
import * as bcrypt from 'bcrypt';

describe('Employee tenant references and provisioning', () => {
  let db: any, service: EmployeesService;
  const dto: any = { email: 'new@example.com', firstName: 'New', lastName: 'Member', departmentId: 'd', designationId: 'j', managerId: 'm' };
  beforeEach(() => {
    db = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ maxEmployees: 10, _count: { employees: 0 } }) },
      department: { findFirst: jest.fn().mockResolvedValue({ id: 'd' }) },
      designation: { findFirst: jest.fn().mockResolvedValue({ id: 'j' }) },
      employee: {
        findFirst: jest.fn(async ({ where }) => where.email ? null : { id: where.id }),
        create: jest.fn(async ({ data }) => ({ ...data, id: 'e' })),
        update: jest.fn(async ({ data }) => ({ ...data, id: 'e' })),
      },
      user: { create: jest.fn().mockResolvedValue({}) }, auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    db.$transaction = jest.fn(async callback => callback(db));
    service = new EmployeesService(db);
  });
  it.each(['departmentId', 'designationId', 'managerId'])('rejects cross-tenant %s on create and update', async field => {
    const model = field === 'departmentId' ? db.department : field === 'designationId' ? db.designation : db.employee;
    model.findFirst.mockResolvedValue(null);
    await expect(service.create('tenant-a', dto, {})).rejects.toThrow('Invalid');
    await expect(service.update('tenant-a', 'e', { [field]: dto[field] }, {})).rejects.toThrow('Invalid');
    expect(model.findFirst).toHaveBeenCalledWith({ where: { id: dto[field], tenantId: 'tenant-a' } });
    expect(db.employee.create).not.toHaveBeenCalled();
    expect(db.employee.update).not.toHaveBeenCalled();
  });
  it('accepts same-tenant references and provisions inactive accounts with unique hidden passwords', async () => {
    await service.create('tenant-a', dto, {});
    await service.create('tenant-a', dto, {});
    const [first, second] = db.user.create.mock.calls.map(([arg]) => arg.data);
    expect(first.isActive).toBe(false);
    expect(first.passwordHash).not.toEqual(second.passwordHash);
    expect(first.passwordHash).toMatch(/^\$2/);
    expect(await bcrypt.compare('Password123!', first.passwordHash)).toBe(false);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    const result = await service.update('tenant-a', 'e', { departmentId: 'd' }, {});
    expect(result.departmentId).toBe('d');
  });
  it('rejects update of another tenant employee and missing tenant context', async () => {
    db.employee.findFirst.mockResolvedValue(null);
    await expect(service.update('tenant-a', 'foreign', {}, {})).rejects.toThrow('not found');
    await expect(service.create(undefined, dto, {})).rejects.toThrow('Tenant context');
  });

  it('propagates account provisioning failure from the transaction before auditing success', async () => {
    db.user.create.mockRejectedValue(new Error('Account conflict'));
    await expect(service.create('tenant-a', dto, {})).rejects.toThrow('Account conflict');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});
