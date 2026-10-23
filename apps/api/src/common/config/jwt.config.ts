export const DEV_DEFAULT_JWT_SECRET = 'seyyon_people_dev_super_secret_access_jwt_key_pranexia_studio_2026';
export const DEV_DEFAULT_JWT_REFRESH_SECRET = 'seyyon_people_dev_super_secret_refresh_jwt_key_pranexia_studio_2026';

/**
 * Returns the JWT access token secret.
 * Enforces strict, non-fallback secrets in production.
 */
export function getJwtSecret(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_SECRET;

  if (isProduction) {
    if (!secret || secret.trim() === '' || secret === DEV_DEFAULT_JWT_SECRET) {
      throw new Error(
        'FATAL: Production JWT configuration missing or invalid. Set a cryptographically secure JWT_SECRET (dev fallback secrets are rejected).'
      );
    }
    return secret;
  }

  return secret || DEV_DEFAULT_JWT_SECRET;
}

/**
 * Returns the JWT refresh token secret.
 * Enforces strict, non-fallback secrets in production.
 */
export function getJwtRefreshSecret(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_REFRESH_SECRET;

  if (isProduction) {
    if (!secret || secret.trim() === '' || secret === DEV_DEFAULT_JWT_REFRESH_SECRET) {
      throw new Error(
        'FATAL: Production JWT configuration missing or invalid. Set a cryptographically secure JWT_REFRESH_SECRET (dev fallback secrets are rejected).'
      );
    }
    return secret;
  }

  return secret || DEV_DEFAULT_JWT_REFRESH_SECRET;
}

/**
 * Validates required authentication secrets at application startup.
 */
export function validateJwtConfig(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    getJwtSecret();
    getJwtRefreshSecret();
  }
}
