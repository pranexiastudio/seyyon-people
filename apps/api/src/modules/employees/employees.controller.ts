import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, ParseArrayPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/create-employee.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantId } from '../../common/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '@seyyon/shared';

@ApiTags('Employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions(Permission.EMPLOYEE_READ)
  @ApiOperation({ summary: 'List employees with pagination, search, and department filters' })
  async findAll(
    @CurrentTenantId() tenantId: string,
    @Query() query: { search?: string; departmentId?: string; status?: string; page?: number; limit?: number }
  ) {
    return this.employeesService.findAll(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.EMPLOYEE_READ)
  @ApiOperation({ summary: 'Get employee profile by ID with field-level security checks' })
  async findById(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: any
  ) {
    return this.employeesService.findById(tenantId, id, user);
  }

  @Post()
  @RequirePermissions(Permission.EMPLOYEE_CREATE)
  @ApiOperation({ summary: 'Create new employee, assign ID, and provision portal account' })
  async create(
    @CurrentTenantId() tenantId: string,
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() user: any
  ) {
    return this.employeesService.create(tenantId, dto, user);
  }

  @Put(':id')
  @RequirePermissions(Permission.EMPLOYEE_UPDATE)
  @ApiOperation({ summary: 'Update employee record or status' })
  async update(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: any
  ) {
    return this.employeesService.update(tenantId, id, dto, user);
  }

  @Post('bulk-import')
  @RequirePermissions(Permission.EMPLOYEE_CREATE)
  @ApiOperation({ summary: 'Bulk import employees from validated CSV/JSON array' })
  async bulkImport(
    @CurrentTenantId() tenantId: string,
    @Body(new ParseArrayPipe({ items: CreateEmployeeDto, whitelist: true, forbidNonWhitelisted: true })) employees: CreateEmployeeDto[],
    @CurrentUser() user: any
  ) {
    return this.employeesService.importBulk(tenantId, employees, user);
  }
}
