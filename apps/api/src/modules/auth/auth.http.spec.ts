import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request = require('supertest');
import * as bcrypt from 'bcrypt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { ActivationService } from './activation.service';
import { ActivationRateGuard } from './activation-rate.guard';
import { BrowserAuthGuard } from './browser-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantsController } from '../tenants/tenants.controller';
import { TenantsService } from '../tenants/tenants.service';
import { getCorsOptions } from '../../common/config/cors.config';
import { getJwtSecret } from '../../common/config/jwt.config';

describe('Authentication HTTP integration (real JWT/guards/bcrypt, mocked Prisma)', () => {
  let app: INestApplication, user: any, db: any;
  const credentials = { email: 'employee@example.com', password: 'Http-test-password-123' };
  const headers = { Origin: 'http://localhost:5173', 'X-Requested-With': 'seyyon-browser' };
  const cookie = (response: any): string => response.headers['set-cookie'][0].split(';')[0];
  beforeEach(async () => {
    user = { id: 'u', email: credentials.email, passwordHash: await bcrypt.hash(credentials.password, 4),
      isActive: true, role: 'EMPLOYEE', tenantId: 't', employeeId: 'e', firstName: 'Test', lastName: 'User',
      tenant: { id: 't', name: 'Test organization', status: 'ACTIVE', planTier: 'STARTER' } };
    db = {
      user: {
        findUnique: jest.fn(async ({ where }) => where.email && where.email !== user.email ? null : { ...user }),
        update: jest.fn(async ({ data }) => Object.assign(user, data)),
        updateMany: jest.fn(async ({ where, data }) => {
          if (user.id !== where.id || user.refreshTokenHash !== where.refreshTokenHash
            || (where.isActive && !user.isActive) || (where.tenant && user.tenant?.status === 'SUSPENDED')) return { count: 0 };
          Object.assign(user, data); return { count: 1 };
        }),
      },
      tenant: { findUnique: jest.fn(async ({ where }) => where.id === 't' ? user.tenant : null) },
      rolePermission: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AuthController, TenantsController],
      providers: [AuthService, JwtService, JwtStrategy, TenantGuard, PermissionsGuard, BrowserAuthGuard, ActivationRateGuard,
        { provide: PrismaService, useValue: db }, { provide: ActivationService, useValue: {} },
        { provide: TenantsService, useValue: { getAllTenants: jest.fn().mockResolvedValue([]), getTenantDetails: jest.fn().mockResolvedValue({ id: 't' }) } }],
    }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.enableCors(getCorsOptions());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterEach(async () => { await app.close(); });
  const login = () => request(app.getHttpServer()).post('/api/v1/auth/login').set(headers).send(credentials);

  it('authenticates credentials, issues an HttpOnly cookie, and exposes a minimal current profile', async () => {
    const response = await login().expect(200);
    expect(response.body).toHaveProperty('accessToken'); expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['cache-control']).toBe('no-store');
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').auth(response.body.accessToken, { type: 'bearer' }).expect(200);
    expect(me.body.role).toBe('EMPLOYEE'); expect(me.body.permissions).toContain('attendance:record');
    expect(me.body).not.toHaveProperty('passwordHash'); expect(me.body).not.toHaveProperty('refreshTokenHash');
    expect(me.body).not.toHaveProperty('employee');
  });
  it('rejects wrong passwords, arbitrary emails, and client-provided roles', async () => {
    for (const body of [{ ...credentials, password: 'incorrect' }, { ...credentials, email: 'unknown@example.com' }]) {
      await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers).send(body).expect(401);
    }
    await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers).send({ ...credentials, role: 'PLATFORM_SUPER_ADMIN' }).expect(400);
  });
  it('rotates cookie sessions, rejects replay, and logs out without an access token', async () => {
    const first = await login().expect(200);
    const rotated = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set(headers).set('Cookie', cookie(first)).send({}).expect(200);
    expect(cookie(rotated)).not.toBe(cookie(first)); expect(rotated.body).not.toHaveProperty('refreshToken');
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').set(headers).set('Cookie', cookie(first)).send({}).expect(401);
    const logout = await request(app.getHttpServer()).post('/api/v1/auth/logout').set(headers).set('Cookie', cookie(rotated)).send({}).expect(200);
    expect(logout.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').set(headers).set('Cookie', cookie(rotated)).send({}).expect(401);
  });
  it('rejects missing/foreign Origins and headers; accepts the existing CORS preflight', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/login').send(credentials).expect(403);
    await request(app.getHttpServer()).post('/api/v1/auth/login').set({ ...headers, Origin: 'https://attacker.example' }).send(credentials).expect(500);
    await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', headers.Origin).send(credentials).expect(403);
    const preflight = await request(app.getHttpServer()).options('/api/v1/auth/refresh').set('Origin', headers.Origin)
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type,x-requested-with').expect(204);
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    expect(preflight.headers['access-control-allow-headers'].toLowerCase()).toContain('x-requested-with');
  });
  it('does not accept refresh tokens in request bodies or bearer tokens', async () => {
    const first = await login().expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').set(headers).send({ refreshToken: cookie(first) }).expect(400);
    await request(app.getHttpServer()).get('/api/v1/auth/me').auth(cookie(first).split('=')[1], { type: 'bearer' }).expect(401);
  });
  it('rejects expired and invalidly signed access tokens through Passport', async () => {
    const jwt = new JwtService();
    const expired = jwt.sign({ sub: 'u', type: 'access' }, { secret: getJwtSecret(), expiresIn: -1 });
    const invalid = jwt.sign({ sub: 'u', type: 'access' }, { secret: 'test-only-wrong-signing-key', expiresIn: '15m' });
    for (const token of [expired, invalid]) {
      await request(app.getHttpServer()).get('/api/v1/auth/me').auth(token, { type: 'bearer' }).expect(401);
    }
  });
  it('logout is idempotent and cannot use an arbitrary user ID or role to revoke a session', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set(headers).send({ userId: 'another-user' }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set(headers).send({}).expect(200);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
  it('retains the cookie on database failure so logout can revoke it on retry', async () => {
    const first = await login().expect(200);
    db.user.updateMany.mockRejectedValueOnce(new Error('Test storage failure'));
    const failed = await request(app.getHttpServer()).post('/api/v1/auth/logout').set(headers).set('Cookie', cookie(first)).send({}).expect(500);
    expect(failed.headers['set-cookie']).toBeUndefined();
    expect(user.refreshTokenHash).not.toBeNull();
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set(headers).set('Cookie', cookie(first)).send({}).expect(200);
    expect(user.refreshTokenHash).toBeNull();
  });
  it('denies anonymous/non-platform registry access and validates platform tenant context', async () => {
    await request(app.getHttpServer()).get('/api/v1/tenants/platform/all').expect(401);
    const first = await login().expect(200);
    const bearer = first.body.accessToken;
    await request(app.getHttpServer()).get('/api/v1/tenants/platform/all').auth(bearer, { type: 'bearer' }).expect(403);
    user.role = 'PLATFORM_SUPER_ADMIN'; user.tenantId = null; user.tenant = null;
    await request(app.getHttpServer()).get('/api/v1/tenants/platform/all').auth(bearer, { type: 'bearer' }).expect(200);
    await request(app.getHttpServer()).get('/api/v1/tenants/current').auth(bearer, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get('/api/v1/tenants/current').set('X-Tenant-Id', 'missing').auth(bearer, { type: 'bearer' }).expect(403);
    user.tenant = { id: 't', status: 'ACTIVE' };
    await request(app.getHttpServer()).get('/api/v1/tenants/current').set('X-Tenant-Id', 't').auth(bearer, { type: 'bearer' }).expect(200);
  });
  it.each(['inactive', 'suspended'])('rejects %s users on refresh and profile access', async condition => {
    const first = await login().expect(200);
    if (condition === 'inactive') user.isActive = false; else user.tenant.status = 'SUSPENDED';
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').set(headers).set('Cookie', cookie(first)).send({}).expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/me').auth(first.body.accessToken, { type: 'bearer' }).expect(401);
  });
});
