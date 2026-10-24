import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Permission, UserRole } from '@seyyon/shared';

describe('Employee update HTTP authorization (mocked authentication, service and tenant storage)', () => {
  let app: INestApplication, actor: any, update: jest.Mock;
  beforeAll(async () => {
    update = jest.fn().mockResolvedValue({ id: 'e', status: 'ACTIVE' });
    const module = await Test.createTestingModule({ controllers: [EmployeesController], providers: [
      { provide: EmployeesService, useValue: { update } },
      { provide: PrismaService, useValue: { tenant: { findUnique: jest.fn(async ({ where }) => where.id === 't' ? { id: 't', status: 'ACTIVE' } : null) } } },
    ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: context => { if (!actor) return false; context.switchToHttp().getRequest().user = actor; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  });
  beforeEach(() => { update.mockClear(); actor = { id: 'u', tenantId: 't', role: UserRole.EMPLOYEE, permissions: [] }; });
  afterAll(async () => { await app?.close(); });
  it.each([UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.HR_ADMIN])('denies %s without employee:update', async role => {
    actor.role = role; await request(app.getHttpServer()).put('/api/v1/employees/e').send({ firstName: 'New' }).expect(403); expect(update).not.toHaveBeenCalled();
  });
  it('allows an explicitly permitted HR user and ignores a foreign tenant header', async () => {
    actor.role = UserRole.HR_ADMIN; actor.permissions = [Permission.EMPLOYEE_UPDATE];
    await request(app.getHttpServer()).put('/api/v1/employees/e').set('X-Tenant-Id', 'foreign').send({ firstName: 'New' }).expect(200);
    expect(update).toHaveBeenCalledWith('t', 'e', expect.objectContaining({ firstName: 'New' }), actor);
  });
  it('allows the company administrator within its organization', async () => {
    actor.role = UserRole.COMPANY_ADMIN; await request(app.getHttpServer()).put('/api/v1/employees/e').send({ status: 'NOTICE_PERIOD' }).expect(200);
    expect(update.mock.calls[0][0]).toBe('t');
  });
  it('requires a valid explicit tenant for platform administrators', async () => {
    actor.role = UserRole.PLATFORM_SUPER_ADMIN; actor.tenantId = null;
    await request(app.getHttpServer()).put('/api/v1/employees/e').send({ status: 'ACTIVE' }).expect(403);
    await request(app.getHttpServer()).put('/api/v1/employees/e').set('X-Tenant-Id', 'foreign').send({ status: 'ACTIVE' }).expect(403);
    expect(update).not.toHaveBeenCalled();
    await request(app.getHttpServer()).put('/api/v1/employees/e').set('X-Tenant-Id', 't').send({ status: 'ACTIVE' }).expect(200);
    expect(update.mock.calls[0][0]).toBe('t');
  });
  it.each([{ isActive: true }, { tenantId: 'foreign' }, { email: 'new@example.com' }, { status: 'DISABLED' }, { firstName: '  ' }])('rejects unsupported or invalid fields before updating %#', async body => {
    actor.role = UserRole.COMPANY_ADMIN; await request(app.getHttpServer()).put('/api/v1/employees/e').send(body).expect(400); expect(update).not.toHaveBeenCalled();
  });
});
