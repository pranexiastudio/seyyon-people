import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentTenantId } from '../../common/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '@seyyon/shared';

@ApiTags('Departments & Designations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all departments with designations and employee counts' })
  async getDepartments(@CurrentTenantId() tenantId: string) {
    return this.departmentsService.getDepartments(tenantId);
  }

  @Post()
  @RequirePermissions(Permission.DEPARTMENT_MANAGE)
  @ApiOperation({ summary: 'Create department' })
  async createDepartment(
    @CurrentTenantId() tenantId: string,
    @Body() body: { name: string; code: string; description?: string }
  ) {
    return this.departmentsService.createDepartment(tenantId, body);
  }

  @Get('designations')
  @ApiOperation({ summary: 'Get all designations, optionally filtered by department' })
  async getDesignations(
    @CurrentTenantId() tenantId: string,
    @Query('departmentId') departmentId?: string
  ) {
    return this.departmentsService.getDesignations(tenantId, departmentId);
  }

  @Post('designations')
  @RequirePermissions(Permission.DESIGNATION_MANAGE)
  @ApiOperation({ summary: 'Create designation' })
  async createDesignation(
    @CurrentTenantId() tenantId: string,
    @Body() body: { title: string; code: string; departmentId?: string; level?: number }
  ) {
    return this.departmentsService.createDesignation(tenantId, body);
  }
}

