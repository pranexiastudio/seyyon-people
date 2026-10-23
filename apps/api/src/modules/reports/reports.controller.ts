import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentTenantId } from '../../common/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '@seyyon/shared';

@ApiTags('Reports & Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('headcount')
  @RequirePermissions(Permission.REPORTS_HR)
  @ApiOperation({ summary: 'Get organization headcount metrics and department distribution' })
  async getHeadcount(@CurrentTenantId() tenantId: string) {
    return this.reportsService.getHeadcountReport(tenantId);
  }

  @Get('attendance')
  @RequirePermissions(Permission.REPORTS_HR)
  @ApiOperation({ summary: 'Get monthly attendance statistics and absent/late rates' })
  async getAttendance(
    @CurrentTenantId() tenantId: string,
    @Query('month') month?: number,
    @Query('year') year?: number
  ) {
    const now = new Date();
    return this.reportsService.getAttendanceSummaryReport(tenantId, month || now.getMonth() + 1, year || now.getFullYear());
  }

  @Get('payroll')
  @RequirePermissions(Permission.REPORTS_PAYROLL)
  @ApiOperation({ summary: 'Get annual payroll expenditure breakdown and registers' })
  async getPayroll(@CurrentTenantId() tenantId: string, @Query('year') year?: number) {
    return this.reportsService.getPayrollSummaryReport(tenantId, year || new Date().getFullYear());
  }
}
