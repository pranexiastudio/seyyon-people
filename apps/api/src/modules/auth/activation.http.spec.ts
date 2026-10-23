import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ActivationService } from './activation.service';
import { ActivationRateGuard } from './activation-rate.guard';

describe('Public activation HTTP contract (mocked activation service)', () => {
  let app: INestApplication;
  let activate: jest.Mock;
  beforeEach(async () => {
    activate = jest.fn().mockResolvedValue({ message: 'Account activated. You can now sign in with your chosen password.' });
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: ActivationService, useValue: { activate } },
        ActivationRateGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterEach(async () => { await app?.close(); });
  const payload = { token: 'a'.repeat(64), password: 'Strong-password-123' };
  it('accepts a valid public request without signing in or setting a session cookie', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/activate').send(payload).expect(200);
    expect(activate).toHaveBeenCalledWith(expect.objectContaining(payload));
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.body).not.toHaveProperty('token');
  });
  it('rejects tenant overrides and weak passwords before calling the activation service', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/activate').send({ ...payload, tenantId: 'foreign' }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/auth/activate').send({ ...payload, password: 'weak' }).expect(400);
    expect(activate).not.toHaveBeenCalled();
  });
  it('rate-limits the public endpoint', async () => {
    for (let i = 0; i < 10; i++) await request(app.getHttpServer()).post('/api/v1/auth/activate').send(payload).expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/activate').send(payload).expect(429);
    expect(activate).toHaveBeenCalledTimes(10);
  });
});
