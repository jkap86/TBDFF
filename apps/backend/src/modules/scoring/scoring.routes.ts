import { Router } from 'express';
import { ScoringController } from './scoring.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { userMutationLimiter } from '../../middleware/rate-limit.middleware';
import { asyncHandler } from '../../shared/async-handler';

// Routes mounted at /api/scoring
export function createScoringRoutes(controller: ScoringController): Router {
  const router = Router();

  router.use(authMiddleware);
  router.use(userMutationLimiter);

  router.get('/nfl-state', asyncHandler(controller.getNflState));
  router.get('/schedule/:season/:week', asyncHandler(controller.getGameSchedule));

  return router;
}

// Routes mounted at /api/leagues (league-scoped scoring)
export function createLeagueScoringRoutes(controller: ScoringController): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/:leagueId/scores/:week', asyncHandler(controller.getLeagueScores));
  router.get('/:leagueId/projections/:week', asyncHandler(controller.getLeagueProjections));
  router.get('/:leagueId/live/:week', asyncHandler(controller.getLiveScores));

  return router;
}
