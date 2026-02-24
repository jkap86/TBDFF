import { Router } from 'express';
import { PlayerController } from './players.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';

export function createPlayerRoutes(controller: PlayerController): Router {
  const router = Router();
  router.use(authMiddleware);  // All routes require auth

  // Read-only routes
  router.get('/', asyncHandler(controller.getAll));
  router.get('/search', asyncHandler(controller.search));
  router.get('/position/:position', asyncHandler(controller.getByPosition));
  router.get('/team/:team', asyncHandler(controller.getByTeam));
  router.get('/:playerId', asyncHandler(controller.getById));

  return router;
}
