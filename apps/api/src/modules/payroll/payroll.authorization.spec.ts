import { PayrollService } from './payroll.service';
import { Permission, UserRole } from '@seyyon/shared';

describe('Payslip authorization for every role', () => {
  let db: any, service: PayrollService;
  beforeEach(() => {
    db = { payslip: { findFirst: jest.fn().mockResolvedValue({ employeeId: 'owner', tenantId: 't' }), findMany: jest.fn() } };
    service = new PayrollService(db);
  });
  it.each([UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.HR_ADMIN])('restricts %s with self-only permission to own payslips', async role => {
    const user = { role, tenantId: 't', employeeId: 'other', permissions: [Permission.PAYROLL_READ_SELF] };
    await expect(service.getPayslipById('t', 'p', user)).rejects.toThrow();
    await expect(service.getPayslipById('t', 'p', { ...user, employeeId: 'owner' })).resolves.toHaveProperty('employeeId', 'owner');
    await expect(service.getPayslipById('t', 'p', { ...user, employeeId: null })).rejects.toThrow();
  });
  it.each([UserRole.HR_ADMIN, UserRole.COMPANY_ADMIN, UserRole.PLATFORM_SUPER_ADMIN])('allows authorized %s access only within target tenant', async role => {
    await expect(service.getPayslipById('t', 'p', { role, tenantId: 't', permissions: [Permission.PAYROLL_READ_ALL] })).resolves.toBeDefined();
    expect(db.payslip.findFirst.mock.calls[0][0].where).toEqual({ id: 'p', tenantId: 't' });
    db.payslip.findFirst.mockResolvedValue(null);
    await expect(service.getPayslipById('t', 'foreign', { role, tenantId: 't' })).rejects.toThrow('not found');
  });
  it('rejects missing tenant, foreign tenant identity, and absent employee profile', async () => {
    await expect(service.getPayslipById(undefined, 'p', { role: UserRole.PLATFORM_SUPER_ADMIN })).rejects.toThrow();
    await expect(service.getPayslipById('t', 'p', { role: UserRole.HR_ADMIN, tenantId: 'other' })).rejects.toThrow();
    await expect(service.getMyPayslips('t', null)).rejects.toThrow();
    expect(db.payslip.findMany).not.toHaveBeenCalled();
  });
});
