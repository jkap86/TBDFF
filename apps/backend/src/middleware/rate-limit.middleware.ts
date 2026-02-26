import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { AuthRequest } from './auth.middleware';

/**
 * Coarse IP-keyed rate limiter for mutation endpoints (POST/PUT/PATCH/DELETE).
 * Applied globally on /api before auth runs.
 * 60 requests per minute per IP.
 */
export const ipMutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
  skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' },
  },
});

/**
 * User-keyed rate limiter for authenticated mutation endpoints.
 * Applied after authMiddleware on protected routes.
 * 60 requests per minute per user (falls back to IP if user is missing).
 */
export const userMutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authReq = req as AuthRequest;
    return `user:${authReq.user?.userId ?? ipKeyGenerator(req.ip ?? '')}`;
  },
  skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' },
  },
});

/**
 * Stricter rate limiter for expensive operations (draft picks, trades, waivers).
 * 20 requests per minute per user.
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authReq = req as AuthRequest;
    return `strict:${authReq.user?.userId ?? ipKeyGenerator(req.ip ?? '')}`;
  },
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' },
  },
});
