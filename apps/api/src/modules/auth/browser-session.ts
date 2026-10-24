import { UnauthorizedException } from '@nestjs/common';
import { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE = 'seyyon_refresh';
export const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true, secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', path: '/api/v1/auth',
});

export function readRefreshCookie(request: Request): string | undefined {
  const values = (request.headers.cookie || '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith(`${REFRESH_COOKIE}=`));
  if (values.length > 1) throw new UnauthorizedException('Invalid refresh session');
  const value = values[0]?.slice(REFRESH_COOKIE.length + 1);
  if (!value) return undefined;
  // JWT cookies need no decoding. Reject malformed/oversized input without echoing it.
  if (value.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    throw new UnauthorizedException('Invalid refresh session');
  }
  return value;
}

export function writeRefreshCookie(response: Response, token: string) {
  response.cookie(REFRESH_COOKIE, token, { ...refreshCookieOptions(), maxAge: 7 * 86400000 });
  response.setHeader('Cache-Control', 'no-store');
}

export function clearRefreshCookie(response: Response) {
  response.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  response.setHeader('Cache-Control', 'no-store');
}
