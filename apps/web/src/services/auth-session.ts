import { ApiError, apiRequest, AuthUser, browserAuth, profile, TokenResponse } from './auth-api';
export type SessionState = {
  status: 'restoring' | 'authenticated' | 'anonymous' | 'unavailable';
  user: AuthUser | null; message?: string;
};
export class AuthSession {
  private state: SessionState = { status: 'restoring', user: null };
  private listeners = new Set<() => void>();
  private token: string | null = null;
  private expiresAt = 0;
  private epoch = 0;
  private pendingRefresh?: Promise<void>;
  private restoring?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private channel?: BroadcastChannel;
  private timer?: ReturnType<typeof setTimeout>;
  private started = false;
  constructor(private clearCache: () => void = () => {}) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: SessionState) { this.state = state; this.listeners.forEach(listener => listener()); }
  start() {
    if (this.started) return;
    this.started = true;
    try { localStorage.removeItem('seyyon_active_user'); } catch { /* Never use storage as authentication. */ }
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('seyyon-auth');
      this.channel.onmessage = event => {
        if (event.data === 'logout' || event.data === 'identity-changed') this.invalidate();
      };
    }
    void this.restore();
  }
  dispose() { ++this.epoch; this.token = null; this.channel?.close(); clearTimeout(this.timer); }
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      if (!navigator.locks || typeof BroadcastChannel === 'undefined') {
        throw new Error('This browser cannot coordinate secure sessions');
      }
      return await navigator.locks.request('seyyon-auth-cookie', operation);
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private assertCurrent(epoch: number) { if (epoch !== this.epoch) throw new Error('Session changed'); }
  private invalidate(message?: string) {
    ++this.epoch; this.token = null; this.expiresAt = 0;
    clearTimeout(this.timer); this.clearCache();
    this.publish({ status: 'anonymous', user: null, message });
  }
  private accept(tokens: TokenResponse, user: AuthUser, epoch: number) {
    this.assertCurrent(epoch);
    if (!tokens.accessToken || !Number.isFinite(tokens.expiresIn) || tokens.expiresIn <= 0
      || !user.id || !user.role || !Array.isArray(user.permissions)) throw new Error('Invalid session response');
    this.token = tokens.accessToken;
    this.expiresAt = Date.now() + tokens.expiresIn * 1000;
    this.publish({ status: 'authenticated', user });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.refresh().catch(() => undefined); }, Math.max(0, tokens.expiresIn * 1000 - 30000));
  }
  private failure(error: unknown, epoch: number) {
    if (epoch !== this.epoch) return;
    this.token = null; clearTimeout(this.timer); this.clearCache();
    if (error instanceof ApiError && error.status === 401) this.invalidate('Your session has ended. Please sign in.');
    else this.publish({ status: 'unavailable', user: null, message: 'Unable to verify your session. Please retry.' });
  }
  restore = (): Promise<void> => {
    if (this.restoring) return this.restoring;
    this.publish({ status: 'restoring', user: null });
    this.restoring = this.refresh().catch(() => undefined).finally(() => { this.restoring = undefined; });
    return this.restoring;
  };
  private refresh(): Promise<void> {
    if (this.pendingRefresh) return this.pendingRefresh;
    const epoch = this.epoch;
    const operation = this.exclusive(async () => {
      this.assertCurrent(epoch);
      const tokens = await browserAuth<TokenResponse>('refresh');
      this.assertCurrent(epoch);
      const user = await profile(tokens.accessToken);
      this.accept(tokens, user, epoch);
    }).catch(error => { this.failure(error, epoch); throw error; });
    this.pendingRefresh = operation;
    void operation.finally(() => { if (this.pendingRefresh === operation) this.pendingRefresh = undefined; }).catch(() => undefined);
    return operation;
  }
  login = async (email: string, password: string): Promise<boolean> => {
    this.invalidate();
    const epoch = this.epoch;
    try {
      await this.exclusive(async () => {
        this.assertCurrent(epoch);
        const tokens = await browserAuth<TokenResponse>('login', { email: email.trim().toLowerCase(), password });
        this.assertCurrent(epoch);
        const user = await profile(tokens.accessToken);
        this.clearCache(); this.accept(tokens, user, epoch);
        this.channel?.postMessage('identity-changed');
      });
      this.assertCurrent(epoch);
      return true;
    } catch (error) {
      if (epoch !== this.epoch) return false;
      this.invalidate(error instanceof ApiError && [400, 401].includes(error.status)
        ? 'Invalid email or password.' : 'Sign-in is unavailable. Please try again.');
      return false;
    }
  };
  logout = async (): Promise<void> => {
    this.invalidate();
    const epoch = this.epoch;
    this.channel?.postMessage('logout');
    // Wait for outstanding Set-Cookie responses before revoking the latest cookie.
    try { await this.exclusive(() => browserAuth('logout')); }
    catch {
      if (epoch === this.epoch) this.publish({ status: 'anonymous', user: null,
        message: 'Signed out locally. Server sign-out could not be confirmed. Retry sign-out before leaving this browser.' });
      throw new Error('Server sign-out could not be confirmed');
    }
  };
  request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const epoch = this.epoch;
    if (this.state.status !== 'authenticated') throw new Error('Authentication required');
    if (!this.token || Date.now() >= this.expiresAt - 30000) await this.refresh();
    this.assertCurrent(epoch);
    const send = (token: string) => {
      const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${token}`);
      return apiRequest<T>(path, { ...init, headers });
    };
    const usedToken = this.token!;
    try { const result = await send(usedToken); this.assertCurrent(epoch); return result; }
    catch (error) {
      this.assertCurrent(epoch);
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      if (this.token === usedToken) await this.refresh();
      this.assertCurrent(epoch);
      if (!['GET', 'HEAD'].includes((init.method || 'GET').toUpperCase())) throw error;
      try { const result = await send(this.token!); this.assertCurrent(epoch); return result; }
      catch (retryError) { if (retryError instanceof ApiError && retryError.status === 401) this.failure(retryError, epoch); throw retryError; }
    }
  };
}
