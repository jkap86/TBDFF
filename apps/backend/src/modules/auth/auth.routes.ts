import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import { validate } from '../../shared/validate';
import { registerSchema, loginSchema, refreshSchema } from './auth.schemas';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many refresh attempts, try again later' } },
});

export function createAuthRoutes(controller: AuthController): Router {
  const router = Router();

  router.post('/register', authLimiter, validate(registerSchema), asyncHandler(controller.register));
  router.post('/login', authLimiter, validate(loginSchema), asyncHandler(controller.login));
  router.post('/refresh', refreshLimiter, validate(refreshSchema), asyncHandler(controller.refresh));
  router.get('/me', authMiddleware, asyncHandler(controller.me));
  router.post('/logout', authMiddleware, asyncHandler(controller.logout));

  return router;
}
