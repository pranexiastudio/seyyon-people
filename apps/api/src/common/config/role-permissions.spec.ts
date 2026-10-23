import { resolvePermissions } from './role-permissions';
import { Permission as P, UserRole } from '@seyyon/shared';

describe('Least privilege permission defaults for unseeded roles', () => {
  it('grants self-service without administrative permissions to employees/managers', () => {
    for (const role of [UserRole.EMPLOYEE, UserRole.MANAGER]) {
      const grants = resolvePermissions(role, []);
      expect(grants).toContain(P.PAYROLL_READ_SELF);
      for (const forbidden of [P.PAYROLL_READ_ALL, P.EMPLOYEE_CREATE, P.ATTENDANCE_IMPORT_BIOMETRIC, P.ATTENDANCE_APPROVE, P.LEAVE_APPROVE, P.REPORTS_HR]) {
        expect(grants).not.toContain(forbidden);
      }
    }
  });
  it('grants HR operations without platform powers', () => {
    const grants = resolvePermissions(UserRole.HR_ADMIN, []);
    expect(grants).toContain(P.ATTENDANCE_IMPORT_BIOMETRIC);
    expect(grants).toContain(P.PAYROLL_READ_ALL);
    expect(grants).not.toContain(P.TENANT_SUSPEND);
    expect(grants).not.toContain(P.ROLES_MANAGE);
  });
  it('respects explicit restricted grants without merging permissive defaults', () => {
    expect(resolvePermissions(UserRole.HR_ADMIN, [{ permission: P.PAYROLL_READ_SELF }])).toEqual([P.PAYROLL_READ_SELF]);
    expect(resolvePermissions('UNKNOWN' as any, [])).toEqual([]);
  });
});
