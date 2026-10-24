import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSession } from './auth-session';
import { ApiError } from './auth-api';

const user = { id: 'u', email: 'employee@example.com', firstName: 'Test', lastName: 'User', role: 'EMPLOYEE', tenantId: 't', employeeId: 'e', tenant: null, permissions: [] };
const token = { accessToken: 'test-access', expiresIn: 900 };
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
let fetchMock: ReturnType<typeof vi.fn>, sessions: AuthSession[];
class TestChannel { onmessage: ((event: { data: unknown }) => void) | null = null; postMessage = vi.fn(); close = vi.fn(); }
beforeEach(() => {
  sessions = []; localStorage.clear();
  vi.stubGlobal('BroadcastChannel', TestChannel);
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn((_name, operation) => operation()) } });
  fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { sessions.forEach(session => session.dispose()); vi.unstubAllGlobals(); vi.useRealTimers(); });
const create = (clear = vi.fn()) => { const session = new AuthSession(clear); sessions.push(session); return session; };

describe('Memory-only authenticated sessions', () => {
  it('never restores a forged localStorage identity and removes the legacy key', async () => {
    localStorage.setItem('seyyon_active_user', JSON.stringify({ role: 'PLATFORM_SUPER_ADMIN' }));
    fetchMock.mockResolvedValue(response({}, 401));
    const session = create(); session.start(); await vi.waitFor(() => expect(session.getSnapshot().status).toBe('anonymous'));
    expect(localStorage.getItem('seyyon_active_user')).toBeNull();
    expect(session.getSnapshot().user).toBeNull();
  });
  it('requires refresh and backend profile before restoring, and stores no tokens', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockResolvedValueOnce(response(token)).mockReturnValueOnce(pending.promise);
    const session = create(); const restoring = session.restore();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(session.getSnapshot().status).toBe('restoring');
    pending.resolve(response(user)); await restoring;
    expect(session.getSnapshot().status).toBe('authenticated');
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it('rejects arbitrary email/wrong password without fabricating identity', async () => {
    fetchMock.mockResolvedValue(response({}, 401)); const session = create();
    expect(await session.login('unknown@example.com', 'incorrect')).toBe(false);
    expect(session.getSnapshot()).toMatchObject({ status: 'anonymous', user: null, message: 'Invalid email or password.' });
  });
  it.each(['login', 'refresh'] as const)('blocks a stale in-flight %s response after logout and clears cached data', async action => {
    const pending = deferred<ReturnType<typeof response>>(); const clear = vi.fn();
    fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response({ success: true }));
    const session = create(clear);
    const inflight = action === 'login' ? session.login('employee@example.com', 'a-password') : session.restore();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const logout = session.logout();
    expect(session.getSnapshot().status).toBe('anonymous'); expect(clear).toHaveBeenCalled();
    pending.resolve(response(token)); await inflight; await logout;
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([`/api/v1/auth/${action}`, '/api/v1/auth/logout']);
    expect(session.getSnapshot().user).toBeNull();
  });
  it('blocks a profile response arriving after logout', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockResolvedValueOnce(response(token)).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response({}));
    const session = create(); const restoring = session.restore();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const logout = session.logout(); pending.resolve(response(user)); await restoring; await logout;
    expect(session.getSnapshot().status).toBe('anonymous');
  });
  it('blocks content during a network failure and allows restoration retry', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable')).mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response(user));
    const session = create(); await session.restore(); expect(session.getSnapshot().status).toBe('unavailable');
    await session.restore(); expect(session.getSnapshot().status).toBe('authenticated');
  });
  it('reports unconfirmed server logout without restoring local authentication', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline')); const session = create();
    await expect(session.logout()).rejects.toThrow('Server sign-out');
    expect(session.getSnapshot()).toMatchObject({ status: 'anonymous', user: null });
    expect(session.getSnapshot().message).toContain('could not be confirmed');
  });
  it('does not refresh on forbidden responses', async () => {
    fetchMock.mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response(user)).mockResolvedValueOnce(response({}, 403));
    const session = create(); await session.restore();
    await expect(session.request('/tenants/platform/all')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3); expect(session.getSnapshot().status).toBe('authenticated');
  });
  it('coordinates simultaneous 401 responses into one refresh and retries each read once', async () => {
    fetchMock.mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response(user));
    const session = create(); await session.restore(); let reads = 0, refreshes = 0;
    fetchMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/refresh')) { refreshes++; return response({ ...token, accessToken: 'rotated-access' }); }
      if (path.endsWith('/me')) return response(user);
      return ++reads <= 2 ? response({}, 401) : response({ ok: true });
    });
    await Promise.all([session.request('/one'), session.request('/two')]);
    expect(refreshes).toBe(1); expect(reads).toBe(4);
  });
  it('ends the session when refresh is rejected and does not loop', async () => {
    fetchMock.mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response(user)).mockResolvedValue(response({}, 401));
    const session = create(); await session.restore(); await expect(session.request('/one')).rejects.toBeInstanceOf(ApiError);
    expect(session.getSnapshot().status).toBe('anonymous'); expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('does not automatically replay a state-changing request', async () => {
    fetchMock.mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response(user));
    const session = create(); await session.restore(); await expect(session.request('/change', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock.mock.calls.filter(call => call[0].endsWith('/change'))).toHaveLength(1);
  });
  it('refreshes before expiry and revalidates backend identity', async () => {
    vi.useFakeTimers(); fetchMock.mockImplementation(async (path: string) => response(path.endsWith('/me') ? user : token));
    const session = create(); await session.restore(); await vi.advanceTimersByTimeAsync(870000);
    expect(fetchMock.mock.calls.filter(call => call[0].endsWith('/refresh'))).toHaveLength(2);
  });
  it('rejects a private API response that arrives after logout', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response(user))
      .mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response({}));
    const session = create(); await session.restore(); const read = session.request('/private');
    const rejected = expect(read).rejects.toThrow('Session changed');
    await session.logout(); pending.resolve(response({ privateData: true })); await rejected;
  });
  it('fails closed when cross-tab session coordination is unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    const session = create(); await session.restore();
    expect(session.getSnapshot().status).toBe('unavailable'); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('broadcasts logout without tokens and clears another tab immediately', async () => {
    const channels: TestChannel[] = [];
    vi.stubGlobal('BroadcastChannel', class extends TestChannel {
      constructor() { super(); channels.push(this); }
      postMessage = vi.fn((data: unknown) => channels.forEach(channel => { if (channel !== this) channel.onmessage?.({ data }); }));
    });
    fetchMock.mockImplementation(async (path: string) => response(path.endsWith('/me') ? user : token));
    const first = create(), second = create(); first.start(); second.start();
    await vi.waitFor(() => expect(second.getSnapshot().status).toBe('authenticated'));
    await first.logout();
    expect(second.getSnapshot()).toMatchObject({ status: 'anonymous', user: null });
    expect(channels[0].postMessage).toHaveBeenCalledWith('logout');
  });
  it('serializes different tabs so logout follows an outstanding cookie rotation', async () => {
    let queue = Promise.resolve<unknown>(undefined);
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: (_name: string, operation: () => Promise<unknown>) => {
        const result = queue.then(operation); queue = result.catch(() => undefined); return result;
      },
    } });
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(user)).mockResolvedValueOnce(response({}));
    const first = create(), second = create(); const refreshing = first.restore();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const logout = second.logout();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(response(token)); await refreshing; await logout;
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/v1/auth/refresh', '/api/v1/auth/me', '/api/v1/auth/logout']);
  });
});
