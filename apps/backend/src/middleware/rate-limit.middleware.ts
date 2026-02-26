import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { AuthRequest } from './auth.middleware';

/**
 * General rate limiter for mutation endpoints (POST/PUT/PATCH/DELETE).
 * Applied globally before auth, so keyed by IP address.
 * 60 requests per minute per IP.
 */
export const mutationLimiter = rateLimit({
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
