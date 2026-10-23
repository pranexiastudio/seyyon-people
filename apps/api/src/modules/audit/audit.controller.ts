import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenantId } from '../../common/decorators/current-tenant.decorator';
import { UserRole } from '@seyyon/shared';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'View immutable organizational security and activity audit logs' })
  async getLogs(
    @CurrentTenantId() tenantId: string,
    @Query('limit') limit?: number
  ) {
    return this.auditService.getLogs(tenantId, limit ? Number(limit) : 50);
  }
}
