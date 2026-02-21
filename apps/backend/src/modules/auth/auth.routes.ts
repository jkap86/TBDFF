import { Router } from 'express';
import { Pool } from 'pg';
import rateLimit from 'express-rate-limit';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRepository } from './auth.repository';
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

export function createAuthRoutes(pool: Pool): Router {
  const userRepository = new UserRepository(pool);
  const authService = new AuthService(userRepository);
  const controller = new AuthController(authService);

  const router = Router();

  router.post('/register', authLimiter, validate(registerSchema), asyncHandler(controller.register));
  router.post('/login', authLimiter, validate(loginSchema), asyncHandler(controller.login));
  router.post('/refresh', refreshLimiter, validate(refreshSchema), asyncHandler(controller.refresh));
  router.get('/me', authMiddleware, asyncHandler(controller.me));
  router.post('/logout', authMiddleware, asyncHandler(controller.logout));

  return router;
}
