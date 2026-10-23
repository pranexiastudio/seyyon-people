import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantId } from '../../common/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '@seyyon/shared';
import { RunPayrollDto } from './payroll.dto';

@ApiTags('Payroll & Payslips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('cycles')
  @RequirePermissions(Permission.PAYROLL_READ_ALL)
  @ApiOperation({ summary: 'Get all monthly payroll processing cycles' })
  async getCycles(@CurrentTenantId() tenantId: string) {
    return this.payrollService.getCycles(tenantId);
  }

  @Get('cycles/:id')
  @RequirePermissions(Permission.PAYROLL_READ_ALL)
  @ApiOperation({ summary: 'Get payroll cycle details and all generated payslips' })
  async getCycleById(@CurrentTenantId() tenantId: string, @Param('id') id: string) {
    return this.payrollService.getCycleById(tenantId, id);
  }

  @Post('run')
  @RequirePermissions(Permission.PAYROLL_PROCESS)
  @ApiOperation({ summary: 'Execute monthly payroll processing cycle with statutory rules' })
  async runPayroll(
    @CurrentTenantId() tenantId: string,
    @Body() body: RunPayrollDto,
    @CurrentUser() user: any
  ) {
    return this.payrollService.executeMonthlyRun(tenantId, body.month, body.year, user.id);
  }

  @Post('cycles/:id/finalize')
  @RequirePermissions(Permission.PAYROLL_FINALIZE)
  @ApiOperation({ summary: 'Finalize, lock, and approve payroll cycle' })
  async finalizeCycle(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: any
  ) {
    return this.payrollService.finalizeCycle(tenantId, id, user.id);
  }

  @Get('my-payslips')
  @RequirePermissions(Permission.PAYROLL_READ_SELF)
  @ApiOperation({ summary: 'Get payslips history for logged-in employee self-service' })
  async getMyPayslips(@CurrentTenantId() tenantId: string, @CurrentUser() user: any) {
    return this.payrollService.getMyPayslips(tenantId, user.employeeId);
  }

  @Get('payslips/:id')
  @RequirePermissions(Permission.PAYROLL_READ_SELF)
  @ApiOperation({ summary: 'View specific payslip details and breakdown' })
  async getPayslipById(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: any
  ) {
    return this.payrollService.getPayslipById(tenantId, id, user);
  }
}
