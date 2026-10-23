import { AuthService, hashRefreshToken } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { getJwtRefreshSecret } from '../../common/config/jwt.config';
import * as bcrypt from 'bcrypt';

describe('Authentication session lifecycle', () => {
  let prisma: any, service: AuthService, jwt: JwtService, user: any;
  beforeEach(() => {
    user = { id: 'u', tenantId: 't', tenant: { status: 'ACTIVE' }, isActive: true, role: 'EMPLOYEE' };
    prisma = { user: {
      findUnique: jest.fn(async () => ({ ...user })),
      update: jest.fn(async ({ data }) => Object.assign(user, data)),
      updateMany: jest.fn(async ({ where, data }) => {
        if (user.refreshTokenHash !== where.refreshTokenHash || !user.isActive) return { count: 0 };
        Object.assign(user, data); return { count: 1 };
      }),
    }, auditLog: { create: jest.fn().mockResolvedValue({}) } };
    jwt = new JwtService();
    service = new AuthService(prisma, jwt);
  });
  const loginDto = { email: 'a@example.com', password: 'test-password' };
  async function login() {
    user.passwordHash = await bcrypt.hash(loginDto.password, 4);
    return service.login(loginDto);
  }
  it.each(['inactive', 'suspended'])('rejects %s accounts on login and refresh', async condition => {
    const tokens = await login();
    if (condition === 'inactive') user.isActive = false;
    else user.tenant.status = 'SUSPENDED';
    await expect(service.login(loginDto)).rejects.toThrow();
    await expect(service.refreshTokens(tokens.refreshToken)).rejects.toThrow();
  });
  it('hashes the entire token beyond the bcrypt length limit', () => {
    const prefix = 'a'.repeat(100);
    expect(hashRefreshToken(prefix + '1')).not.toBe(hashRefreshToken(prefix + '2'));
  });
  it('rotates to unique tokens in the same second and rejects replay', async () => {
    const first = await login();
    const second = await service.refreshTokens(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(service.refreshTokens(first.refreshToken)).rejects.toThrow();
    await expect(service.refreshTokens(second.refreshToken)).resolves.toHaveProperty('accessToken');
  });
  it('permits only one concurrent rotation of the same token', async () => {
    const tokens = await login();
    const results = await Promise.allSettled([
      service.refreshTokens(tokens.refreshToken), service.refreshTokens(tokens.refreshToken),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('logout invalidates the refresh session', async () => {
    const tokens = await login();
    await service.logout(user.id);
    await expect(service.refreshTokens(tokens.refreshToken)).rejects.toThrow();
  });
  it('logout racing rotation cannot restore the revoked session', async () => {
    const tokens = await login();
    prisma.user.updateMany.mockImplementationOnce(async () => { await service.logout(user.id); return { count: 0 }; });
    await expect(service.refreshTokens(tokens.refreshToken)).rejects.toThrow();
    expect(user.refreshTokenHash).toBeNull();
  });
  it('rejects legacy bcrypt refresh sessions and requires login', async () => {
    const tokens = await login();
    user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 4);
    await expect(service.refreshTokens(tokens.refreshToken)).rejects.toThrow();
  });
  it('rejects expired, wrong-type, and invalid-signature tokens', async () => {
    for (const token of [
      jwt.sign({ sub: 'u', type: 'refresh', jti: '1' }, { secret: getJwtRefreshSecret(), expiresIn: -1 }),
      jwt.sign({ sub: 'u', type: 'access' }, { secret: getJwtRefreshSecret() }),
      jwt.sign({ sub: 'u', type: 'refresh' }, { secret: 'invalid-test-key' }),
    ]) await expect(service.refreshTokens(token)).rejects.toThrow();
  });
});
