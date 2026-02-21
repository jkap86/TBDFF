import { Router } from 'express';
import { Pool } from 'pg';
import { PlayerRepository } from './players.repository';
import { PlayerService } from './players.service';
import { PlayerController } from './players.controller';
import { SleeperApiClient } from '../../integrations/sleeper/sleeper-api-client';
import { SleeperPlayerProvider } from '../../integrations/sleeper/sleeper-player-provider';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';

export function createPlayerRoutes(pool: Pool): Router {
  // Dependency injection chain
  const playerRepository = new PlayerRepository(pool);

  // Provider setup - swap this line to change data source!
  const sleeperApi = new SleeperApiClient();
  const playerProvider = new SleeperPlayerProvider(sleeperApi);
  // Future: const playerProvider = new EspnPlayerProvider(espnApi);

  const playerService = new PlayerService(playerRepository, playerProvider);
  const controller = new PlayerController(playerService);

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
