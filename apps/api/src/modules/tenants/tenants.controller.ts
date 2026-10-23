import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenantId } from '../../common/decorators/current-tenant.decorator';
import { UserRole, SubscriptionStatus } from '@seyyon/shared';
import { PlatformOperation } from '../../common/decorators/platform-operation.decorator';
import { UpdateTenantDto, TenantStatusDto } from './tenants.dto';

@ApiTags('Tenants & SaaS Operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('platform/all')
  @PlatformOperation()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Platform SuperAdmin: View all customer organization tenants' })
  async getAllTenants() {
    return this.tenantsService.getAllTenants();
  }

  @Get('current')
  @ApiOperation({ summary: 'Get current tenant organization profile and subscription' })
  async getCurrentTenant(@CurrentTenantId() tenantId: string) {
    return this.tenantsService.getTenantDetails(tenantId);
  }

  @Get('current/usage')
  @ApiOperation({ summary: 'Get current tenant seat consumption and plan usage metrics' })
  async getUsage(@CurrentTenantId() tenantId: string) {
    return this.tenantsService.getUsage(tenantId);
  }

  @Put('current')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Update organization settings' })
  async updateCurrentTenant(
    @CurrentTenantId() tenantId: string,
    @Body() body: UpdateTenantDto
  ) {
    return this.tenantsService.updateTenant(tenantId, body);
  }

  @Put(':id/status')
  @PlatformOperation()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Platform SuperAdmin: Suspend or reactivate customer tenant' })
  async setStatus(
    @Param('id') id: string,
    @Body() body: TenantStatusDto
  ) {
    return this.tenantsService.setTenantStatus(id, body.status);
  }
}
