import { TenantGuard } from './tenant.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@seyyon/shared';
import { PLATFORM_OPERATION } from '../decorators/platform-operation.decorator';

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
    } as unknown as ExecutionContext;
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

  it('requires an explicit validated tenant for super admin tenant operations', async () => {
    const user = { role: UserRole.PLATFORM_SUPER_ADMIN };
    await expect(guard.canActivate(createMockContext(user))).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(createMockContext(user, { 'x-tenant-id': 'missing' }))).rejects.toThrow('not found');
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 's', status: 'SUSPENDED' });
    await expect(guard.canActivate(createMockContext(user, { 'x-tenant-id': 's' }))).rejects.toThrow('suspended');
  });

  it('ignores forged tenant headers from regular users', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'own', status: 'ACTIVE' });
    const ctx = createMockContext({ role: UserRole.EMPLOYEE, tenantId: 'own' }, { 'x-tenant-id': 'foreign' });
    await guard.canActivate(ctx);
    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'own' } }));
    expect(ctx.switchToHttp().getRequest().tenantId).toBe('own');
  });

  it('allows only explicitly marked platform operations without tenant context', async () => {
    const ctx = createMockContext({ role: UserRole.PLATFORM_SUPER_ADMIN });
    const handler = () => {};
    Reflect.defineMetadata(PLATFORM_OPERATION, true, handler);
    ctx.getHandler = () => handler;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});
