import { getAllowedOrigins, getCorsOptions } from './cors.config';
import { getJwtSecret, getJwtRefreshSecret, DEV_DEFAULT_JWT_SECRET, DEV_DEFAULT_JWT_REFRESH_SECRET, validateJwtConfig } from './jwt.config';

describe('Security Configuration - CORS & JWT Hardening', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('CORS Allowlist Security', () => {
    it('should include standard local frontend origins in development mode', () => {
      process.env.NODE_ENV = 'development';
      const origins = getAllowedOrigins();

      expect(origins).toContain('http://localhost:5173');
      expect(origins).toContain('http://127.0.0.1:5173');
      expect(origins).toContain('http://localhost:3000');
    });

    it('should support explicitly configured APP_WEB_URL and CORS_ALLOWED_ORIGINS', () => {
      process.env.NODE_ENV = 'development';
      process.env.APP_WEB_URL = 'http://localhost:8080';
      process.env.CORS_ALLOWED_ORIGINS = 'https://app.seyyon.com, https://admin.seyyon.com';

      const origins = getAllowedOrigins();
      expect(origins).toContain('http://localhost:8080');
      expect(origins).toContain('https://app.seyyon.com');
      expect(origins).toContain('https://admin.seyyon.com');
    });

    it('should allow requests from permitted origins in corsOptions', (done) => {
      process.env.NODE_ENV = 'development';
      const options = getCorsOptions();
      const originFn = options.origin as Function;

      originFn('http://localhost:5173', (err: Error | null, allow?: boolean) => {
        expect(err).toBeNull();
        expect(allow).toBe(true);
        done();
      });
    });

    it('should allow non-browser requests with no origin header (mobile, curl)', (done) => {
      process.env.NODE_ENV = 'development';
      const options = getCorsOptions();
      const originFn = options.origin as Function;

      originFn(undefined, (err: Error | null, allow?: boolean) => {
        expect(err).toBeNull();
        expect(allow).toBe(true);
        done();
      });
    });

    it('should reject unauthorized origins not in the allowlist', (done) => {
      process.env.NODE_ENV = 'development';
      const options = getCorsOptions();
      const originFn = options.origin as Function;

      originFn('https://evil-attacker.com', (err: Error | null, allow?: boolean) => {
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toContain('not permitted by Seyyon People security policy');
        done();
      });
    });

    it('should fail safely in production when configuration is missing or empty', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.CORS_ALLOWED_ORIGINS;
      delete process.env.APP_WEB_URL;

      expect(() => getAllowedOrigins()).toThrow(/FATAL: Production CORS configuration missing or invalid/);
    });

    it('should fail safely in production when wildcard * is configured', () => {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ALLOWED_ORIGINS = '*';

      expect(() => getAllowedOrigins()).toThrow(/FATAL: Production CORS configuration missing or invalid/);
    });
  });

  describe('JWT Configuration & Production Secret Validation', () => {
    it('should return configured development secret in development mode', () => {
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = 'explicit_dev_secret_key';
      expect(getJwtSecret()).toBe('explicit_dev_secret_key');
    });

    it('should fail safely in production when JWT_SECRET is unset or empty', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      expect(() => getJwtSecret()).toThrow(/FATAL: Production JWT configuration missing or invalid/);
    });

    it('should reject insecure development fallback secret in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = DEV_DEFAULT_JWT_SECRET;
      expect(() => getJwtSecret()).toThrow(/dev fallback secrets are rejected/);
    });

    it('should reject insecure development fallback refresh secret in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_REFRESH_SECRET = DEV_DEFAULT_JWT_REFRESH_SECRET;
      expect(() => getJwtRefreshSecret()).toThrow(/dev fallback secrets are rejected/);
    });

    it('should accept valid cryptographically secure production secrets', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'c8f74e92a8374d6f02b5e1a9c3d4e5f67890abcdef1234567890abcdef123456';
      process.env.JWT_REFRESH_SECRET = 'd9e83f01b9485e7a13c6f2b0d4e5f6a78901bcdef2345678901bcdef234567';

      expect(getJwtSecret()).toBe('c8f74e92a8374d6f02b5e1a9c3d4e5f67890abcdef1234567890abcdef123456');
      expect(getJwtRefreshSecret()).toBe('d9e83f01b9485e7a13c6f2b0d4e5f6a78901bcdef2345678901bcdef234567');
      expect(() => validateJwtConfig()).not.toThrow();
    });
  });
});
