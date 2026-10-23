import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@seyyon/shared';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Platform Super Admin bypasses tenant restrictions or can scope to a tenant via header
    if (user.role === UserRole.PLATFORM_SUPER_ADMIN) {
      const explicitTenantId = request.headers['x-tenant-id'] as string;
      if (explicitTenantId) {
        request.tenantId = explicitTenantId;
      }
      return true;
    }

    if (!user.tenantId) {
      throw new ForbiddenException('User is not associated with any organization tenant');
    }

    // Verify tenant is active in database (or cached)
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, status: true, slug: true, name: true },
    });

    if (!tenant) {
      throw new ForbiddenException('Organization tenant not found');
    }

    if (tenant.status === 'SUSPENDED') {
      throw new ForbiddenException('Organization tenant account is suspended. Please contact Pranexia Studio support.');
    }

    request.tenantId = tenant.id;
    request.tenant = tenant;

    return true;
  }
}
