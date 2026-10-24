import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { Permission, UserRole } from '@seyyon/shared';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('Employee bulk import HTTP boundary (mocked authentication, storage and import service)', () => {
  let app: INestApplication, actor: any, importBulk: jest.Mock;
  const row = { firstName: 'New', lastName: 'Person', email: 'new@example.com', departmentId: 'd', designationId: 'j' };
  beforeAll(async () => {
    importBulk = jest.fn(async (_tenant, rows) => ({ total: rows.length, created: rows.length, failed: 0, invitationsPending: 0, errors: [] }));
    const module = await Test.createTestingModule({ controllers: [EmployeesController], providers: [
      { provide: EmployeesService, useValue: { importBulk } },
      { provide: PrismaService, useValue: { tenant: { findUnique: jest.fn(async ({ where }) => where.id === 't' ? { id: 't', status: 'ACTIVE' } : null) } } },
    ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: context => { if (!actor) return false; context.switchToHttp().getRequest().user = actor; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  });
  beforeEach(() => { importBulk.mockClear(); actor = { id: 'u', tenantId: 't', role: UserRole.COMPANY_ADMIN, permissions: [] }; });
  afterAll(async () => { await app?.close(); });
  it('accepts a raw array, not a made-up multipart or envelope contract', async () => {
    await request(app.getHttpServer()).post('/api/v1/employees/bulk-import').set('X-Tenant-Id', 'foreign').send([row]).expect(201);
    expect(importBulk).toHaveBeenCalledWith('t', [expect.objectContaining(row)], actor);
    await request(app.getHttpServer()).post('/api/v1/employees/bulk-import').send({ employees: [row] }).expect(400); expect(importBulk).toHaveBeenCalledTimes(1);
  });
  it.each([[], Array(101).fill(row), [row, { ...row, email: 'invalid' }], [{ ...row, tenantId: 'foreign' }], [{ ...row, password: 'private-value' }]].map(rows => ({ rows })))('rejects an invalid whole batch before importing any row %#', async ({ rows }) => {
    await request(app.getHttpServer()).post('/api/v1/employees/bulk-import').send(rows).expect(400); expect(importBulk).not.toHaveBeenCalled();
  });
  it('rejects oversized mapped JSON payloads before import work', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/employees/bulk-import').send([{ ...row, phone: 'x'.repeat(66000) }]).expect(413);
    expect(response.body.message).not.toContain('xxx'); expect(importBulk).not.toHaveBeenCalled();
  });
  it('accepts the maximum 100-row batch', async () => {
    await request(app.getHttpServer()).post('/api/v1/employees/bulk-import').send(Array(100).fill(row)).expect(201);
    expect(importBulk).toHaveBeenCalledTimes(1);
  });
  it.each([UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.HR_ADMIN])('denies %s without create permission', async role => {
    actor.role = role; await request(app.getHttpServer()).post('/api/v1/employees/bulk-import').send([row]).expect(403); expect(importBulk).not.toHaveBeenCalled();
  });
  it('allows explicitly permitted HR with the server-derived tenant', async () => {
    actor.role = UserRole.HR_ADMIN; actor.permissions = [Permission.EMPLOYEE_CREATE];
    await request(app.getHttpServer()).post('/api/v1/employees/bulk-import').send([row]).expect(201); expect(importBulk.mock.calls[0][0]).toBe('t');
  });
  it('requires valid explicit platform tenant context', async () => {
    actor.role = UserRole.PLATFORM_SUPER_ADMIN; actor.tenantId = null;
    await request(app.getHttpServer()).post('/api/v1/employees/bulk-import').send([row]).expect(403);
    await request(app.getHttpServer()).post('/api/v1/employees/bulk-import').set('X-Tenant-Id', 'foreign').send([row]).expect(403); expect(importBulk).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post('/api/v1/employees/bulk-import').set('X-Tenant-Id', 't').send([row]).expect(201); expect(importBulk.mock.calls[0][0]).toBe('t');
  });
});
