import { Router } from 'express';
import { Pool } from 'pg';
import { DraftController } from './drafts.controller';
import { DraftService } from './drafts.service';
import { DraftRepository } from './drafts.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { PlayerRepository } from '../players/players.repository';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import { validate } from '../../shared/validate';
import {
  createDraftSchema,
  updateDraftSchema,
  setDraftOrderSchema,
  makeDraftPickSchema,
} from './drafts.schemas';

function buildController(pool: Pool): DraftController {
  const draftRepository = new DraftRepository(pool);
  const leagueRepository = new LeagueRepository(pool);
  const playerRepository = new PlayerRepository(pool);
  const draftService = new DraftService(draftRepository, leagueRepository, playerRepository);
  return new DraftController(draftService);
}

/**
 * League-scoped draft routes
 * Mounted at /api/leagues in server.ts (merged with league routes)
 */
export function createDraftLeagueRoutes(pool: Pool): Router {
  const controller = buildController(pool);
  const router = Router();

  router.use(authMiddleware);

  // Create a draft for a league
  router.post('/:leagueId/drafts', validate(createDraftSchema), asyncHandler(controller.create));

  // List all drafts for a league
  router.get('/:leagueId/drafts', asyncHandler(controller.getByLeague));

  return router;
}

/**
 * Draft-scoped routes (direct access by draft ID)
 * Mounted at /api/drafts in server.ts
 */
export function createDraftRoutes(pool: Pool): Router {
  const controller = buildController(pool);
  const router = Router();

  router.use(authMiddleware);

  // Get a single draft
  router.get('/:draftId', asyncHandler(controller.getById));

  // Update draft settings (pre_draft only)
  router.put('/:draftId', validate(updateDraftSchema), asyncHandler(controller.update));

  // Set draft order
  router.put('/:draftId/order', validate(setDraftOrderSchema), asyncHandler(controller.setOrder));

  // Start the draft
  router.post('/:draftId/start', asyncHandler(controller.start));

  // Get all picks
  router.get('/:draftId/picks', asyncHandler(controller.getPicks));

  // Make a pick
  router.post('/:draftId/picks', validate(makeDraftPickSchema), asyncHandler(controller.makePick));

  // Auto-pick best available (timer expired or commissioner override)
  router.post('/:draftId/autopick', asyncHandler(controller.autoPick));

  // Toggle auto-pick mode for the current user
  router.post('/:draftId/autopick/toggle', asyncHandler(controller.toggleAutoPick));

  return router;
}
