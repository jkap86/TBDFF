import { Router } from 'express';
import { Pool } from 'pg';
import { ScoringController } from './scoring.controller';
import { ScoringService } from './scoring.service';
import { ScoringRepository } from './scoring.repository';
import { PlayerRepository } from '../players/players.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { SleeperApiClient } from '../../integrations/sleeper/sleeper-api-client';
import { SleeperStatsProvider } from '../../integrations/sleeper/sleeper-stats-provider';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';

function buildScoringController(pool: Pool): ScoringController {
  const scoringRepository = new ScoringRepository(pool);
  const playerRepository = new PlayerRepository(pool);
  const leagueRepository = new LeagueRepository(pool);
  const sleeperApi = new SleeperApiClient();
  const statsProvider = new SleeperStatsProvider(sleeperApi);
  const service = new ScoringService(
    scoringRepository,
    playerRepository,
    leagueRepository,
    statsProvider,
  );
  return new ScoringController(service);
}

// Routes mounted at /api/scoring
export function createScoringRoutes(pool: Pool): Router {
  const controller = buildScoringController(pool);
  const router = Router();

  router.use(authMiddleware);

  router.get('/nfl-state', asyncHandler(controller.getNflState));
  router.get('/schedule/:season/:week', asyncHandler(controller.getGameSchedule));
  router.post('/sync', asyncHandler(controller.syncStats));

  return router;
}

// Routes mounted at /api/leagues (league-scoped scoring)
export function createLeagueScoringRoutes(pool: Pool): Router {
  const controller = buildScoringController(pool);
  const router = Router();

  router.use(authMiddleware);

  router.get('/:leagueId/scores/:week', asyncHandler(controller.getLeagueScores));
  router.get('/:leagueId/projections/:week', asyncHandler(controller.getLeagueProjections));
  router.get('/:leagueId/live/:week', asyncHandler(controller.getLiveScores));

  return router;
}
