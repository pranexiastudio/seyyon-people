import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Resolves the explicit list of allowed origins based on environment configuration.
 * In production:
 *   - An explicit allowlist is required via CORS_ALLOWED_ORIGINS or APP_WEB_URL.
 *   - Missing configuration or wildcard origins trigger a fail-safe exception.
 * In development:
 *   - Local frontend origins (e.g. Vite on 5173, Next/standard on 3000) and any configured URLs are permitted.
 */
export function getAllowedOrigins(): string[] {
  const isProduction = process.env.NODE_ENV === 'production';
  const customOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

  const appWebUrl = process.env.APP_WEB_URL ? process.env.APP_WEB_URL.trim() : null;

  if (isProduction) {
    const origins = [...customOrigins];
    if (appWebUrl && !origins.includes(appWebUrl)) {
      origins.push(appWebUrl);
    }

    // Fail safely: wildcards or empty allowlists are strictly rejected in production
    if (origins.length === 0 || origins.includes('*')) {
      throw new Error(
        'FATAL: Production CORS configuration missing or invalid. Set explicit origins in CORS_ALLOWED_ORIGINS or APP_WEB_URL.'
      );
    }

    return origins;
  }

  // Development & Test allowlist
  const devDefaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  const origins = new Set<string>(devDefaults);
  if (appWebUrl) {
    origins.add(appWebUrl);
  }
  customOrigins.forEach((o) => origins.add(o));

  return Array.from(origins);
}

/**
 * Returns NestJS CORS options enforcing the explicit allowlist and least-privilege methods/headers.
 */
export function getCorsOptions(): CorsOptions {
  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow non-browser requests (e.g. mobile clients, microservices, curl) without origin header
      if (!origin) {
        return callback(null, true);
      }

      const allowed = getAllowedOrigins();
      if (allowed.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS origin '${origin}' not permitted by Seyyon People security policy.`)
      );
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-Id',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    credentials: true,
    maxAge: 86400,
  };
}
