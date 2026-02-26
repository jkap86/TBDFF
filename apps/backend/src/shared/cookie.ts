import { Response } from 'express';
import { config } from '../config';

const REFRESH_COOKIE = 'tbdff_refresh';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const isProduction = config.NODE_ENV === 'production';

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: MAX_AGE_MS,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/api/auth',
  });
}

export function getRefreshCookie(cookies: Record<string, string>): string | undefined {
  return cookies?.[REFRESH_COOKIE];
}
