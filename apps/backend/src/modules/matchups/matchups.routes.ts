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

  // Matchup Derby (must be before /:week catch-all)
  router.post('/:leagueId/matchups/derby/start', asyncHandler(controller.startDerby));
  router.get('/:leagueId/matchups/derby', asyncHandler(controller.getDerbyState));
  router.post('/:leagueId/matchups/derby/pick', asyncHandler(controller.makeDerbyPick));
  router.post('/:leagueId/matchups/derby/autopick', asyncHandler(controller.derbyAutoPick));
  router.patch('/:leagueId/matchups/derby/settings', asyncHandler(controller.updateDerbySettings));

  // Get all matchups for a league
  router.get('/:leagueId/matchups', asyncHandler(controller.getAll));

  // Get matchups for a specific week
  router.get('/:leagueId/matchups/:week', asyncHandler(controller.getByWeek));

  return router;
}
