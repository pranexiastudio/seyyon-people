import { TenantGuard } from './tenant.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@seyyon/shared';

describe('TenantGuard - Zero Trust Multi-Tenant Boundary Enforcement', () => {
  let guard: TenantGuard;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        findUnique: jest.fn(),
      },
    };
    guard = new TenantGuard(mockPrisma as PrismaService);
  });

  const createMockContext = (user: any, headers: Record<string, string> = {}) => {
    const req: any = { user, headers };
    return {
      getHandler: () => function handler() {},
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as ExecutionContext;
  };

  it('should throw UnauthorizedException when request has no authenticated user', async () => {
    const ctx = createMockContext(null);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw ForbiddenException if user has no associated tenant', async () => {
    const ctx = createMockContext({ id: 'u1', role: UserRole.EMPLOYEE, tenantId: null });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when tenant is SUSPENDED', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-suspended-01',
      name: 'Defunct Corp',
      status: 'SUSPENDED',
    });

    const ctx = createMockContext({ id: 'u1', role: UserRole.EMPLOYEE, tenantId: 'tenant-suspended-01' });
    await expect(guard.canActivate(ctx)).rejects.toThrow('Organization tenant account is suspended');
  });

  it('should allow active tenant user and attach tenant context to request', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-acme',
      name: 'Acme Technologies',
      status: 'ACTIVE',
      slug: 'acme-tech',
    });

    const ctx = createMockContext({ id: 'u1', role: UserRole.EMPLOYEE, tenantId: 'tenant-acme' });
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    const req: any = ctx.switchToHttp().getRequest();
    expect(req.tenantId).toBe('tenant-acme');
    expect(req.tenant.name).toBe('Acme Technologies');
  });

  it('should allow Platform Super Admin to operate across platforms', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-target', status: 'ACTIVE' });
    const ctx = createMockContext(
      { id: 'super-admin-01', role: UserRole.PLATFORM_SUPER_ADMIN, tenantId: null },
      { 'x-tenant-id': 'tenant-target' }
    );
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    const req: any = ctx.switchToHttp().getRequest();
    expect(req.tenantId).toBe('tenant-target');
  });
});
