import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { Permission, UserRole } from '@seyyon/shared';
import { ValidationPipe, ParseArrayPipe } from '@nestjs/common';
import { PunchDto, CorrectionDto, BiometricPunchDto } from './attendance.dto';

describe('Attendance authorization and validation', () => {
  const guard = new PermissionsGuard(new Reflector());
  function context(method: string, user: any): any {
    return { getHandler: () => AttendanceController.prototype[method], getClass: () => AttendanceController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }) };
  }
  it.each(['getCompanyAttendance', 'importBiometricPunches', 'getPendingCorrections'])(
    'denies employee, manager, and unauthenticated callers for %s', method => {
      for (const role of [UserRole.EMPLOYEE, UserRole.MANAGER]) {
        expect(() => guard.canActivate(context(method, { role, permissions: Object.values(Permission) }))).toThrow();
      }
      expect(() => guard.canActivate(context(method, undefined))).toThrow();
      expect(guard.canActivate(context(method, { role: UserRole.COMPANY_ADMIN }))).toBe(true);
    });
  it('requires the specific HR permission for biometric imports', () => {
    expect(() => guard.canActivate(context('importBiometricPunches', { role: UserRole.HR_ADMIN, permissions: [] }))).toThrow();
    expect(guard.canActivate(context('importBiometricPunches', {
      role: UserRole.HR_ADMIN, permissions: [Permission.ATTENDANCE_IMPORT_BIOMETRIC],
    }))).toBe(true);
  });
  it('keeps correction submission available to employees with attendance permission', () => {
    expect(guard.canActivate(context('requestCorrection', { role: UserRole.EMPLOYEE, permissions: [Permission.ATTENDANCE_RECORD] }))).toBe(true);
  });
  it('rejects forged employee fields and invalid punch/date payloads', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    for (const [metatype, body] of [
      [PunchDto, { punchType: 'INVALID' }],
      [CorrectionDto, { date: 'invalid', checkIn: 'invalid', checkOut: 'invalid', reason: 'x' }],
      [CorrectionDto, { date: '2026-10-23', checkIn: '2026-10-23T09:00:00Z', checkOut: '2026-10-23T10:00:00Z', reason: 'x', employeeId: 'foreign' }],
    ] as any[]) await expect(pipe.transform(body, { type: 'body', metatype })).rejects.toThrow();
    const arrayPipe = new ParseArrayPipe({ items: BiometricPunchDto, whitelist: true, forbidNonWhitelisted: true });
    await expect(arrayPipe.transform([{ deviceEmployeeCode: 'E1', timestamp: 'bad', punchType: 'BAD', deviceId: 'd' }], { type: 'body' })).rejects.toThrow();
  });
  it('rejects missing and foreign employee profiles before accessing self-service data', async () => {
    const db: any = { employee: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new AttendanceService(db);
    await expect(service.getTodayStatus('t', null)).rejects.toThrow();
    await expect(service.getMyTimesheet('t', 'foreign')).rejects.toThrow();
    await expect(service.requestCorrection('t', 'foreign', {} as any)).rejects.toThrow();
    expect(db.employee.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', tenantId: 't' } });
  });
  it('scopes administrative reads to the supplied validated tenant', async () => {
    const db: any = { attendanceRecord: { findMany: jest.fn() }, attendanceCorrectionRequest: { findMany: jest.fn() } };
    const service = new AttendanceService(db);
    await service.getTenantAttendance('t'); await service.getPendingCorrections('t');
    expect(db.attendanceRecord.findMany.mock.calls[0][0].where.tenantId).toBe('t');
    expect(db.attendanceCorrectionRequest.findMany.mock.calls[0][0].where.tenantId).toBe('t');
  });
});
