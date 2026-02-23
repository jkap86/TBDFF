import { Router } from 'express';
import { Pool } from 'pg';
import { MatchupController } from './matchups.controller';
import { MatchupService } from './matchups.service';
import { MatchupRepository } from './matchups.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';

export function createMatchupRoutes(pool: Pool): Router {
  const matchupRepository = new MatchupRepository(pool);
  const leagueRepository = new LeagueRepository(pool);
  const matchupService = new MatchupService(matchupRepository, leagueRepository);
  const controller = new MatchupController(matchupService);

  const router = Router();

  router.use(authMiddleware);

  // Generate (or re-generate) matchups — Commissioner only
  router.post('/:leagueId/matchups/generate', asyncHandler(controller.generate));

  // Get all matchups for a league
  router.get('/:leagueId/matchups', asyncHandler(controller.getAll));

  // Get matchups for a specific week
  router.get('/:leagueId/matchups/:week', asyncHandler(controller.getByWeek));

  return router;
}
