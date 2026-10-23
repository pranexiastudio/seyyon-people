import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionStatus } from '@seyyon/shared';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllTenants() {
    return this.prisma.tenant.findMany({
      include: {
        _count: {
          select: { employees: true, users: true, departments: true },
        },
        subscription: {
          include: { plan: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTenantDetails(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { employees: true, departments: true, users: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async updateTenant(tenantId: string, data: { name?: string; address?: string; currency?: string; timezone?: string }) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data,
    });
  }

  async setTenantStatus(tenantId: string, status: SubscriptionStatus) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status },
    });
  }

  async getUsage(tenantId: string) {
    const tenant = await this.getTenantDetails(tenantId);
    return {
      tenantId,
      name: tenant.name,
      planTier: tenant.planTier,
      status: tenant.status,
      currentEmployees: tenant._count.employees,
      maxEmployees: tenant.maxEmployees,
      departmentsCount: tenant._count.departments,
      usagePercent: Math.round((tenant._count.employees / tenant.maxEmployees) * 100),
    };
  }
}
