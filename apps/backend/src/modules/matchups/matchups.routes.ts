import { Router } from 'express';
import { MatchupController } from './matchups.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { userMutationLimiter } from '../../middleware/rate-limit.middleware';
import { asyncHandler } from '../../shared/async-handler';

export function createMatchupRoutes(controller: MatchupController): Router {
  const router = Router();

  router.use(authMiddleware);
  router.use(userMutationLimiter);

  // Generate (or re-generate) matchups — Commissioner only
  router.post('/:leagueId/matchups/generate', asyncHandler(controller.generate));

  // Get all matchups for a league
  router.get('/:leagueId/matchups', asyncHandler(controller.getAll));

  // Get matchups for a specific week
  router.get('/:leagueId/matchups/:week', asyncHandler(controller.getByWeek));

  return router;
}
