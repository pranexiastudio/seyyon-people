import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeaveService } from './leave.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantId } from '../../common/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { LeaveStatus, Permission } from '@seyyon/shared';

@ApiTags('Leave & Holidays')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('balances')
  @ApiOperation({ summary: 'Get current leave balances for logged in employee' })
  async getBalances(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: any,
    @Query('year') year?: number
  ) {
    return this.leaveService.getBalances(tenantId, user.employeeId, year);
  }

  @Post('apply')
  @ApiOperation({ summary: 'Apply for leave with balance and overlap checks' })
  async apply(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() body: { leaveTypeId: string; startDate: string; endDate: string; totalDays: number; reason: string }
  ) {
    return this.leaveService.applyLeave(tenantId, user.employeeId, body);
  }

  @Get('my-requests')
  @ApiOperation({ summary: 'Get leave application history for logged in employee' })
  async getMyRequests(@CurrentTenantId() tenantId: string, @CurrentUser() user: any) {
    return this.leaveService.getMyRequests(tenantId, user.employeeId);
  }

  @Get('pending-approvals')
  @RequirePermissions(Permission.LEAVE_APPROVE)
  @ApiOperation({ summary: 'Get leave requests pending HR / Manager approval' })
  async getPendingApprovals(@CurrentTenantId() tenantId: string) {
    return this.leaveService.getPendingApprovals(tenantId);
  }

  @Put('requests/:id/status')
  @RequirePermissions(Permission.LEAVE_APPROVE)
  @ApiOperation({ summary: 'Approve or reject leave request' })
  async updateStatus(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { status: LeaveStatus.APPROVED | LeaveStatus.REJECTED; notes?: string }
  ) {
    return this.leaveService.updateRequestStatus(tenantId, id, body.status, user.employeeId || user.id, body.notes);
  }

  @Get('holidays')
  @ApiOperation({ summary: 'Get organization holiday calendar for year' })
  async getHolidays(@CurrentTenantId() tenantId: string, @Query('year') year?: number) {
    return this.leaveService.getHolidays(tenantId, year);
  }
}
