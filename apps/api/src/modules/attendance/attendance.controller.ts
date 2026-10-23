import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantId } from '../../common/decorators/current-tenant.decorator';
import { BiometricPunchRecord } from '@seyyon/shared';
import { Request } from 'express';

@ApiTags('Attendance & Shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('punch')
  @ApiOperation({ summary: 'Record web or mobile check-in/out punch' })
  async punch(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() body: { punchType: 'CHECK_IN' | 'CHECK_OUT' },
    @Req() req: Request
  ) {
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    return this.attendanceService.clockPunch(tenantId, user.employeeId, body.punchType, undefined, ipAddress);
  }

  @Get('today')
  @ApiOperation({ summary: 'Get current user punch status for today' })
  async getTodayStatus(@CurrentTenantId() tenantId: string, @CurrentUser() user: any) {
    return this.attendanceService.getTodayStatus(tenantId, user.employeeId);
  }

  @Get('my-timesheet')
  @ApiOperation({ summary: 'Get monthly attendance timesheet for logged in employee' })
  async getMyTimesheet(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: any,
    @Query('month') month?: number,
    @Query('year') year?: number
  ) {
    return this.attendanceService.getMyTimesheet(tenantId, user.employeeId, month, year);
  }

  @Get('company')
  @ApiOperation({ summary: 'Get full organization attendance records for a specific date' })
  async getCompanyAttendance(@CurrentTenantId() tenantId: string, @Query('date') date?: string) {
    return this.attendanceService.getTenantAttendance(tenantId, date);
  }

  @Post('biometric/import')
  @ApiOperation({ summary: 'Ingest biometric batch punch records with deduplication' })
  async importBiometricPunches(
    @CurrentTenantId() tenantId: string,
    @Body() punches: BiometricPunchRecord[]
  ) {
    return this.attendanceService.importBiometricPunches(tenantId, punches);
  }

  @Post('corrections')
  @ApiOperation({ summary: 'Submit attendance correction request' })
  async requestCorrection(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() body: { date: string; checkIn: string; checkOut: string; reason: string }
  ) {
    return this.attendanceService.requestCorrection(tenantId, user.employeeId, body);
  }

  @Get('corrections/pending')
  @ApiOperation({ summary: 'Get pending attendance corrections for HR / Manager approval' })
  async getPendingCorrections(@CurrentTenantId() tenantId: string) {
    return this.attendanceService.getPendingCorrections(tenantId);
  }
}
