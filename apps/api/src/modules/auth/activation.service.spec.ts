import { ActivationService, hashActivationToken } from './activation.service';
import * as bcrypt from 'bcrypt';

describe('Employee activation lifecycle', () => {
  let db: any, mail: any, service: ActivationService, user: any, record: any;
  const password = 'A-strong-password-2026';
  const matches = (row: any, where: any): boolean => row && Object.entries(where).every(([key, value]: any) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('gt' in value) return row[key] > value.gt;
      if ('not' in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
  beforeEach(() => {
    user = { id: 'u', tenantId: 't', employeeId: 'e', email: 'employee@example.com', role: 'EMPLOYEE',
      isActive: false, activationPending: true, lastLoginAt: null, passwordHash: 'unusable',
      refreshTokenHash: null, tenant: { status: 'ACTIVE' }, employee: { tenantId: 't', status: 'ACTIVE' } };
    record = null;
    let queue = Promise.resolve();
    db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: {
        findFirst: jest.fn(async ({ where }) => matches(user, where) ? structuredClone(user) : null),
        updateMany: jest.fn(async ({ where, data }) => {
          const { tenant, employee, ...simple } = where;
          if (!matches(user, simple) || user.tenant.status === 'SUSPENDED'
            || user.employee.tenantId !== user.tenantId || !['ACTIVE', 'PROBATION'].includes(user.employee.status)) return { count: 0 };
          Object.assign(user, data); return { count: 1 };
        }),
      },
      employeeActivationToken: {
        findUnique: jest.fn(async ({ where }) => matches(record, where) ? structuredClone(record) : null),
        upsert: jest.fn(async ({ create, update }) => {
          record = record ? { ...record, ...update } : { ...create, id: 'invitation' };
          return record;
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          if (!matches(record, where)) return { count: 0 };
          Object.assign(record, data); return { count: 1 };
        }),
      },
    };
    // Serialized transaction mock with rollback. Real row locks still need a DB test.
    db.$transaction = jest.fn(callback => {
      const result = queue.then(async () => {
        const snapshot = structuredClone({ user, record });
        try { return await callback(db); }
        catch (error) { user = snapshot.user; record = snapshot.record; throw error; }
      });
      queue = result.catch(() => undefined);
      return result;
    });
    mail = { sendInvitation: jest.fn().mockResolvedValue(undefined) };
    service = new ActivationService(db, mail);
  });
  const invite = async () => {
    await service.invite('t', 'e');
    return mail.sendInvitation.mock.calls.at(-1)[1];
  };
  it('stores only a hash of a secure token with a 24-hour expiry and safe response', async () => {
    const before = Date.now();
    const response = await service.invite('t', 'e');
    const token = mail.sendInvitation.mock.calls[0][1];
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(record.tokenHash).toBe(hashActivationToken(token));
    expect(JSON.stringify(record)).not.toContain(token);
    expect(JSON.stringify(response)).not.toContain(token);
    expect(record.expiresAt.getTime() - before).toBeGreaterThanOrEqual(86400000);
    expect(record.sentAt).toBeInstanceOf(Date);
    expect(user.isActive).toBe(false);
  });
  it('activates a valid pending account without returning authentication tokens', async () => {
    const token = await invite();
    const response = await service.activate({ token, password });
    expect(user.isActive).toBe(true); expect(user.activationPending).toBe(false);
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
    expect(record.consumedAt).toBeInstanceOf(Date);
    expect(user.refreshTokenHash).toBeNull();
    expect(response).not.toHaveProperty('accessToken');
    expect(response).not.toHaveProperty('refreshToken');
  });
  it('rejects invalid, expired, undelivered, and reused tokens', async () => {
    const token = await invite();
    await expect(service.activate({ token: 'f'.repeat(64), password })).rejects.toThrow('invalid');
    record.expiresAt = new Date(Date.now() - 1);
    await expect(service.activate({ token, password })).rejects.toThrow('expired');
    record.expiresAt = new Date(Date.now() + 86400000); record.sentAt = null;
    await expect(service.activate({ token, password })).rejects.toThrow('invalid');
    record.sentAt = new Date();
    await service.activate({ token, password });
    await expect(service.activate({ token, password })).rejects.toThrow('invalid');
  });
  it('allows only one concurrent redemption', async () => {
    const token = await invite();
    const results = await Promise.allSettled([service.activate({ token, password }), service.activate({ token, password })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(db.user.updateMany).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw).toHaveBeenCalled();
  });
  it('invalidates previous tokens on resend', async () => {
    const first = await invite();
    record.lastRequestedAt = new Date(Date.now() - 61000);
    const second = await invite();
    expect(second).not.toBe(first);
    await expect(service.activate({ token: first, password })).rejects.toThrow('invalid');
    await expect(service.activate({ token: second, password })).resolves.toBeDefined();
  });
  it('enforces cooldown and durable per-account invitation limits', async () => {
    await invite();
    await expect(service.invite('t', 'e')).rejects.toMatchObject({ status: 429 });
    record.lastRequestedAt = new Date(Date.now() - 61000); record.requestCount = 5;
    await expect(service.invite('t', 'e')).rejects.toMatchObject({ status: 429 });
    expect(mail.sendInvitation).toHaveBeenCalledTimes(1);
  });
  it('serializes concurrent invitations so only one email is sent', async () => {
    const results = await Promise.allSettled([service.invite('t', 'e'), service.invite('t', 'e')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(mail.sendInvitation).toHaveBeenCalledTimes(1);
  });
  it('rejects cross-tenant invitation and redemption after tenant identity changes', async () => {
    await expect(service.invite('foreign', 'e')).rejects.toThrow('invalid');
    expect(mail.sendInvitation).not.toHaveBeenCalled();
    const token = await invite();
    user.tenantId = 'foreign';
    await expect(service.activate({ token, password })).rejects.toThrow('invalid');
    expect(user.isActive).toBe(false);
  });
  it.each(['suspended', 'deactivated', 'already-active', 'terminated', 'employee-other-tenant', 'previous-login'])(
    'rejects %s account on invitation and redemption', async condition => {
      const token = await invite();
      if (condition === 'suspended') user.tenant.status = 'SUSPENDED';
      if (condition === 'deactivated') user.activationPending = false;
      if (condition === 'already-active') user.isActive = true;
      if (condition === 'terminated') user.employee.status = 'TERMINATED';
      if (condition === 'employee-other-tenant') user.employee.tenantId = 'foreign';
      if (condition === 'previous-login') user.lastLoginAt = new Date();
      record.lastRequestedAt = new Date(Date.now() - 61000);
      await expect(service.invite('t', 'e')).rejects.toThrow('invalid');
      await expect(service.activate({ token, password })).rejects.toThrow('invalid');
      expect(record.consumedAt).toBeNull();
    });
  it('invalidates the new and old invitation on SMTP failure without activating or exposing diagnostics', async () => {
    const old = await invite();
    record.lastRequestedAt = new Date(Date.now() - 61000);
    mail.sendInvitation.mockRejectedValue(new Error('private SMTP credentials'));
    await expect(service.invite('t', 'e')).rejects.toThrow('Invitation could not be sent');
    const failed = mail.sendInvitation.mock.calls.at(-1)[1];
    await expect(service.activate({ token: failed, password })).rejects.toThrow('invalid');
    await expect(service.activate({ token: old, password })).rejects.toThrow('invalid');
    expect(user.isActive).toBe(false);
  });
  it('rolls back token consumption if the account status changes during redemption', async () => {
    const token = await invite();
    db.user.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.activate({ token, password })).rejects.toThrow('invalid');
    expect(record.consumedAt).toBeNull(); expect(user.isActive).toBe(false);
  });

  it('rejects an old token when resend wins the race with redemption', async () => {
    const old = await invite();
    record.lastRequestedAt = new Date(Date.now() - 61000);
    // Both operations read the old account/token before the redemption hash completes.
    const redemption = service.activate({ token: old, password });
    const replacement = await invite();
    await expect(redemption).rejects.toThrow('invalid');
    expect(user.isActive).toBe(false);
    await expect(service.activate({ token: replacement, password })).resolves.toBeDefined();
  });
});
