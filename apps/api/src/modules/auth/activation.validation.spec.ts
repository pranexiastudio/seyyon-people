import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ActivationRateGuard } from './activation-rate.guard';
import { EmployeesController } from '../employees/employees.controller';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DEFAULT_ROLE_PERMISSIONS } from '../../common/config/role-permissions';
import { UserRole } from '@seyyon/shared';

describe('Activation API policy', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const token = 'a'.repeat(64);
  it.each(['short', 'alllowercase123!', 'ALLUPPERCASE123!', 'NoNumbersHere!!', 'NoSymbolsHere123', 'A'.repeat(73), 'A1!' + 'é'.repeat(35)])(
    'rejects weak or bcrypt-truncated password %#', async password => {
      await expect(pipe.transform({ token, password }, { type: 'body', metatype: ActivateAccountDto })).rejects.toThrow();
    });
  it('accepts a strong password and rejects malformed tokens and tenant overrides', async () => {
    await expect(pipe.transform({ token, password: 'Strong-password-123' }, { type: 'body', metatype: ActivateAccountDto })).resolves.toBeInstanceOf(ActivateAccountDto);
    for (const data of [
      { token: 'bad', password: 'Strong-password-123' },
      { token, password: 'Strong-password-123', tenantId: 'foreign' },
    ]) await expect(pipe.transform(data, { type: 'body', metatype: ActivateAccountDto })).rejects.toThrow();
  });
  it('rate-limits redemption by actual client IP, ignoring spoofed forwarding headers', () => {
    const guard = new ActivationRateGuard();
    const context: any = { switchToHttp: () => ({ getRequest: () => ({ ip: '127.0.0.1', headers: { 'x-forwarded-for': Math.random().toString() } }) }) };
    for (let i = 0; i < 10; i++) expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow('Too many requests');
  });
  it('requires employee creation and update grants to resend invitations', () => {
    const guard = new PermissionsGuard(new Reflector());
    for (const role of [UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.HR_ADMIN]) {
      const context: any = {
        getHandler: () => EmployeesController.prototype.resendInvitation, getClass: () => EmployeesController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role, permissions: DEFAULT_ROLE_PERMISSIONS[role] } }) }),
      };
      if (role === UserRole.HR_ADMIN) expect(guard.canActivate(context)).toBe(true);
      else expect(() => guard.canActivate(context)).toThrow();
    }
  });
});
