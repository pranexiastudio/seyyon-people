import { BrowserAuthGuard } from './browser-auth.guard';
import { clearRefreshCookie, readRefreshCookie, refreshCookieOptions, writeRefreshCookie } from './browser-session';

describe('Browser session transport', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = original; });
  const context = (headers: any, json = true): any => ({ switchToHttp: () => ({ getRequest: () => ({ headers, is: () => json }) }) });
  it('requires an exact allowed Origin, custom header, and JSON', () => {
    process.env.NODE_ENV = 'test';
    const guard = new BrowserAuthGuard();
    const headers = { origin: 'http://localhost:5173', 'x-requested-with': 'seyyon-browser' };
    expect(guard.canActivate(context(headers))).toBe(true);
    for (const origin of [undefined, 'null', 'http://localhost:5173/', 'https://attacker.example', 'http://localhost:5173.attacker.example']) {
      expect(() => guard.canActivate(context({ ...headers, origin }))).toThrow();
    }
    expect(() => guard.canActivate(context({ origin: headers.origin }))).toThrow();
    expect(() => guard.canActivate(context(headers, false))).toThrow();
  });
  it('sets matching host-only cookie options on creation and deletion', () => {
    process.env.NODE_ENV = 'production';
    expect(refreshCookieOptions()).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/auth' });
    const response: any = { cookie: jest.fn(), clearCookie: jest.fn(), setHeader: jest.fn() };
    writeRefreshCookie(response, 'test.token.signature'); clearRefreshCookie(response);
    expect(response.cookie.mock.calls[0][2]).toEqual({ ...refreshCookieOptions(), maxAge: 604800000 });
    expect(response.clearCookie).toHaveBeenCalledWith('seyyon_refresh', refreshCookieOptions());
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it('requires HTTPS even for an allowlisted production Origin', () => {
    const originalUrl = process.env.APP_WEB_URL;
    const originalOrigins = process.env.CORS_ALLOWED_ORIGINS;
    try {
      process.env.NODE_ENV = 'production'; process.env.CORS_ALLOWED_ORIGINS = '';
      process.env.APP_WEB_URL = 'http://people.example.com';
      const headers = { origin: process.env.APP_WEB_URL, 'x-requested-with': 'seyyon-browser' };
      expect(() => new BrowserAuthGuard().canActivate(context(headers))).toThrow();
      process.env.APP_WEB_URL = 'https://people.example.com';
      expect(new BrowserAuthGuard().canActivate(context({ ...headers, origin: process.env.APP_WEB_URL }))).toBe(true);
    } finally {
      if (originalUrl === undefined) delete process.env.APP_WEB_URL; else process.env.APP_WEB_URL = originalUrl;
      if (originalOrigins === undefined) delete process.env.CORS_ALLOWED_ORIGINS; else process.env.CORS_ALLOWED_ORIGINS = originalOrigins;
    }
  });
  it('reads only one well-formed refresh cookie and rejects ambiguous values', () => {
    const request = (cookie: string): any => ({ headers: { cookie } });
    expect(readRefreshCookie(request('other=x; seyyon_refresh=a.b.c'))).toBe('a.b.c');
    expect(readRefreshCookie(request('other=x'))).toBeUndefined();
    expect(() => readRefreshCookie(request('seyyon_refresh=a.b.c; seyyon_refresh=d.e.f'))).toThrow();
    expect(() => readRefreshCookie(request('seyyon_refresh=%invalid'))).toThrow();
  });
});
