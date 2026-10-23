import { Controller, Get, Post, Body, Query, UseGuards, Req, ParseArrayPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantId } from '../../common/decorators/current-tenant.decorator';
import { Permission, UserRole } from '@seyyon/shared';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PunchDto, CorrectionDto, BiometricPunchDto } from './attendance.dto';
import { Request } from 'express';

@ApiTags('Attendance & Shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('punch')
  @RequirePermissions(Permission.ATTENDANCE_RECORD)
  @ApiOperation({ summary: 'Record web or mobile check-in/out punch' })
  async punch(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() body: PunchDto,
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
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  @RequirePermissions(Permission.ATTENDANCE_READ)
  @ApiOperation({ summary: 'Get full organization attendance records for a specific date' })
  async getCompanyAttendance(@CurrentTenantId() tenantId: string, @Query('date') date?: string) {
    return this.attendanceService.getTenantAttendance(tenantId, date);
  }

  @Post('biometric/import')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  @RequirePermissions(Permission.ATTENDANCE_IMPORT_BIOMETRIC)
  @ApiOperation({ summary: 'Ingest biometric batch punch records with deduplication' })
  async importBiometricPunches(
    @CurrentTenantId() tenantId: string,
    @Body(new ParseArrayPipe({ items: BiometricPunchDto, whitelist: true, forbidNonWhitelisted: true })) punches: BiometricPunchDto[]
  ) {
    return this.attendanceService.importBiometricPunches(tenantId, punches);
  }

  @Post('corrections')
  @RequirePermissions(Permission.ATTENDANCE_RECORD)
  @ApiOperation({ summary: 'Submit attendance correction request' })
  async requestCorrection(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() body: CorrectionDto
  ) {
    return this.attendanceService.requestCorrection(tenantId, user.employeeId, body);
  }

  @Get('corrections/pending')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.HR_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  @RequirePermissions(Permission.ATTENDANCE_APPROVE)
  @ApiOperation({ summary: 'Get pending attendance corrections for HR / Manager approval' })
  async getPendingCorrections(@CurrentTenantId() tenantId: string) {
    return this.attendanceService.getPendingCorrections(tenantId);
  }
}
