import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import { validate } from '../../shared/validate';
import { registerSchema, loginSchema, refreshSchema, forgotPasswordSchema, resetPasswordSchema, searchUsersSchema } from './auth.schemas';

const isDev = process.env.NODE_ENV === 'development';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many refresh attempts, try again later' } },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many reset attempts, try again later' } },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many reset attempts, try again later' } },
});

export function createAuthRoutes(controller: AuthController): Router {
  const router = Router();

  router.post('/register', authLimiter, validate(registerSchema), asyncHandler(controller.register));
  router.post('/login', authLimiter, validate(loginSchema), asyncHandler(controller.login));
  router.post('/refresh', refreshLimiter, validate(refreshSchema), asyncHandler(controller.refresh));
  router.get('/me', authMiddleware, asyncHandler(controller.me));
  router.post('/logout', authMiddleware, asyncHandler(controller.logout));
  router.post('/clear-session', refreshLimiter, asyncHandler(controller.clearSession));
  router.post('/forgot-password', forgotPasswordLimiter, validate(forgotPasswordSchema), asyncHandler(controller.forgotPassword));
  router.post('/reset-password', resetPasswordLimiter, validate(resetPasswordSchema), asyncHandler(controller.resetPassword));
  router.get('/users/search', authMiddleware, validate(searchUsersSchema, 'query'), asyncHandler(controller.searchUsers));

  return router;
}
