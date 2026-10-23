import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceStatus, AttendancePunchSource, BiometricPunchRecord, BiometricImportResult, LeaveStatus } from '@seyyon/shared';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireEmployee(tenantId: string, employeeId: string) {
    if (!tenantId || !employeeId || !await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId } })) {
      throw new BadRequestException('Employee profile required in this organization');
    }
  }

  async clockPunch(
    tenantId: string,
    employeeId: string,
    punchType: 'CHECK_IN' | 'CHECK_OUT',
    source: AttendancePunchSource = AttendancePunchSource.WEB,
    ipAddress?: string
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const shift = await this.prisma.shift.findFirst({
      where: { tenantId, isDefault: true },
    });

    let record = await this.prisma.attendanceRecord.findUnique({
      where: { tenantId_employeeId_date: { tenantId, employeeId, date: today } },
    });

    const now = new Date();

    if (punchType === 'CHECK_IN') {
      if (record && record.checkInTime) {
        throw new BadRequestException('You have already clocked in today at ' + record.checkInTime.toLocaleTimeString());
      }

      // Check Late Calculation
      let status: AttendanceStatus = AttendanceStatus.PRESENT;
      let lateMinutes = 0;

      if (shift) {
        const [shiftHour, shiftMin] = shift.startTime.split(':').map(Number);
        const shiftStart = new Date(today);
        shiftStart.setHours(shiftHour, shiftMin, 0, 0);

        const graceThreshold = new Date(shiftStart.getTime() + shift.gracePeriodMinutes * 60000);
        if (now > graceThreshold) {
          status = AttendanceStatus.LATE;
          lateMinutes = Math.round((now.getTime() - shiftStart.getTime()) / 60000);
        }
      }

      record = await this.prisma.attendanceRecord.upsert({
        where: { tenantId_employeeId_date: { tenantId, employeeId, date: today } },
        update: {
          checkInTime: now,
          status,
          lateMinutes,
          source,
          ipAddress,
        },
        create: {
          tenantId,
          employeeId,
          date: today,
          checkInTime: now,
          status,
          lateMinutes,
          source,
          ipAddress,
        },
      });
    } else {
      // Clock Out
      if (!record || !record.checkInTime) {
        throw new BadRequestException('Cannot clock out before clocking in today');
      }

      const totalHours = Number(((now.getTime() - record.checkInTime.getTime()) / 3600000).toFixed(2));
      let finalStatus = record.status;
      if (shift && totalHours < shift.halfDayThresholdHours) {
        finalStatus = AttendanceStatus.HALF_DAY;
      }

      record = await this.prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
          checkOutTime: now,
          totalWorkHours: totalHours,
          status: finalStatus,
        },
      });
    }

    return record;
  }

  async getTodayStatus(tenantId: string, employeeId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.attendanceRecord.findUnique({
      where: { tenantId_employeeId_date: { tenantId, employeeId, date: today } },
    });
  }

  async getMyTimesheet(tenantId: string, employeeId: string, month?: number, year?: number) {
    await this.requireEmployee(tenantId, employeeId);
    const currentYear = year || new Date().getFullYear();
    const currentMonth = month || new Date().getMonth() + 1;

    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0);

    return this.prisma.attendanceRecord.findMany({
      where: {
        tenantId,
        employeeId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'desc' },
    });
  }

  async getTenantAttendance(tenantId: string, dateStr?: string) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    return this.prisma.attendanceRecord.findMany({
      where: { tenantId, date: targetDate },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
            designation: { select: { title: true } },
          },
        },
      },
      orderBy: { checkInTime: 'asc' },
    });
  }

  async importBiometricPunches(tenantId: string, punches: BiometricPunchRecord[]): Promise<BiometricImportResult> {
    const result: BiometricImportResult = {
      totalProcessed: punches.length,
      successfulPunches: 0,
      failedPunches: 0,
      duplicatesSkipped: 0,
      errors: [],
    };

    const shift = await this.prisma.shift.findFirst({
      where: { tenantId, isDefault: true },
    });

    for (let i = 0; i < punches.length; i++) {
      const p = punches[i];
      try {
        const employee = await this.prisma.employee.findFirst({
          where: { tenantId, employeeCode: p.deviceEmployeeCode },
        });

        if (!employee) {
          result.failedPunches++;
          result.errors.push({ line: i + 1, message: `Employee code ${p.deviceEmployeeCode} not found` });
          continue;
        }

        const punchTime = new Date(p.timestamp);
        if (isNaN(punchTime.getTime())) {
          result.failedPunches++;
          result.errors.push({ line: i + 1, message: `Invalid timestamp: ${p.timestamp}` });
          continue;
        }

        const punchDate = new Date(punchTime);
        punchDate.setHours(0, 0, 0, 0);

        const existing = await this.prisma.attendanceRecord.findUnique({
          where: { tenantId_employeeId_date: { tenantId, employeeId: employee.id, date: punchDate } },
        });

        if (p.punchType === 'CHECK_IN') {
          if (existing && existing.checkInTime) {
            // Check debounce (2 mins)
            const diffMins = Math.abs((punchTime.getTime() - existing.checkInTime.getTime()) / 60000);
            if (diffMins < 2) {
              result.duplicatesSkipped++;
              continue;
            }
          }

          let status = AttendanceStatus.PRESENT;
          let lateMinutes = 0;
          if (shift) {
            const [sh, sm] = shift.startTime.split(':').map(Number);
            const shiftStart = new Date(punchDate);
            shiftStart.setHours(sh, sm, 0, 0);
            const grace = new Date(shiftStart.getTime() + shift.gracePeriodMinutes * 60000);
            if (punchTime > grace) {
              status = AttendanceStatus.LATE;
              lateMinutes = Math.round((punchTime.getTime() - shiftStart.getTime()) / 60000);
            }
          }

          await this.prisma.attendanceRecord.upsert({
            where: { tenantId_employeeId_date: { tenantId, employeeId: employee.id, date: punchDate } },
            update: {
              checkInTime: punchTime,
              status,
              lateMinutes,
              deviceId: p.deviceId,
              source: AttendancePunchSource.BIOMETRIC_DEVICE,
            },
            create: {
              tenantId,
              employeeId: employee.id,
              date: punchDate,
              checkInTime: punchTime,
              status,
              lateMinutes,
              deviceId: p.deviceId,
              source: AttendancePunchSource.BIOMETRIC_DEVICE,
            },
          });
        } else {
          // CHECK_OUT
          if (existing) {
            const checkIn = existing.checkInTime || punchTime;
            const totalHours = Number(((punchTime.getTime() - checkIn.getTime()) / 3600000).toFixed(2));
            await this.prisma.attendanceRecord.update({
              where: { id: existing.id },
              data: {
                checkOutTime: punchTime,
                totalWorkHours: totalHours,
                deviceId: p.deviceId,
              },
            });
          } else {
            await this.prisma.attendanceRecord.create({
              data: {
                tenantId,
                employeeId: employee.id,
                date: punchDate,
                checkOutTime: punchTime,
                deviceId: p.deviceId,
                source: AttendancePunchSource.BIOMETRIC_DEVICE,
              },
            });
          }
        }

        result.successfulPunches++;
      } catch (err: any) {
        result.failedPunches++;
        result.errors.push({ line: i + 1, message: err.message });
      }
    }

    return result;
  }

  async requestCorrection(tenantId: string, employeeId: string, data: { date: string; checkIn: string; checkOut: string; reason: string }) {
    await this.requireEmployee(tenantId, employeeId);
    if (!(new Date(data.checkOut).getTime() > new Date(data.checkIn).getTime())) {
      throw new BadRequestException('Correction check-out must follow check-in');
    }
    return this.prisma.attendanceCorrectionRequest.create({
      data: {
        tenantId,
        employeeId,
        requestedDate: new Date(data.date),
        requestedCheckIn: new Date(data.checkIn),
        requestedCheckOut: new Date(data.checkOut),
        reason: data.reason,
        status: LeaveStatus.PENDING,
      },
    });
  }

  async getPendingCorrections(tenantId: string) {
    return this.prisma.attendanceCorrectionRequest.findMany({
      where: { tenantId, status: LeaveStatus.PENDING },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true, department: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
