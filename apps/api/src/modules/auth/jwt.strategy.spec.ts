import { JwtStrategy } from './jwt.strategy';
import { Permission, UserRole } from '@seyyon/shared';

describe('Access token database identity and permission resolution', () => {
  let db: any, strategy: JwtStrategy;
  const claims = { sub: 'u', email: 'old@example.com', role: 'COMPANY_ADMIN', tenantId: 'forged' };
  beforeEach(() => {
    db = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', isActive: true, tenantId: 'own', tenant: { status: 'ACTIVE' }, role: UserRole.EMPLOYEE }) },
      rolePermission: { findMany: jest.fn().mockResolvedValue([]) },
    };
    strategy = new JwtStrategy(db);
  });
  it.each(['inactive', 'suspended', 'missing-tenant', 'no-tenant'])('rejects %s database identity', async condition => {
    const user = await db.user.findUnique();
    if (condition === 'inactive') user.isActive = false;
    if (condition === 'suspended') user.tenant.status = 'SUSPENDED';
    if (condition === 'missing-tenant') user.tenant = null;
    if (condition === 'no-tenant') user.tenantId = null;
    await expect(strategy.validate(claims)).rejects.toThrow();
  });
  it('uses current database role and tenant, never stale JWT claims', async () => {
    const identity = await strategy.validate(claims);
    expect(identity.role).toBe(UserRole.EMPLOYEE);
    expect(identity.tenantId).toBe('own');
    expect(identity.permissions).not.toContain(Permission.PAYROLL_READ_ALL);
  });
  it('gives explicit tenant grants precedence over global grants', async () => {
    db.rolePermission.findMany.mockResolvedValue([
      { tenantId: null, permission: Permission.PAYROLL_READ_ALL },
      { tenantId: 'own', permission: Permission.PAYROLL_READ_SELF },
    ]);
    expect((await strategy.validate(claims)).permissions).toEqual([Permission.PAYROLL_READ_SELF]);
  });
  it('rejects refresh tokens used as access tokens even if secrets match', async () => {
    await expect(strategy.validate({ ...claims, type: 'refresh' })).rejects.toThrow();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
