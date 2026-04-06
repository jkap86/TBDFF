import { Router } from 'express';
import { DraftController } from './drafts.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { strictLimiter, userMutationLimiter } from '../../middleware/rate-limit.middleware';
import { asyncHandler } from '../../shared/async-handler';
import { validate } from '../../shared/validate';
import {
  createDraftSchema,
  updateDraftSchema,
  setDraftOrderSchema,
  makeDraftPickSchema,
  nominateDraftPickSchema,
  placeBidSchema,
  setDraftQueueSchema,
  addToQueueSchema,
  updateQueueMaxBidSchema,
  availablePlayersQuerySchema,
  slowNominateSchema,
  slowSetMaxBidSchema,
  derbyPickSchema,
  updateTimersSchema,
} from './drafts.schemas';

/**
 * League-scoped draft routes
 * Mounted at /api/leagues in server.ts (merged with league routes)
 */
export function createDraftLeagueRoutes(controller: DraftController): Router {
  const router = Router();

  router.use(authMiddleware);
  router.use(userMutationLimiter);

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
export function createDraftRoutes(controller: DraftController): Router {
  const router = Router();

  router.use(authMiddleware);
  router.use(userMutationLimiter);

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
  router.post('/:draftId/picks', strictLimiter, validate(makeDraftPickSchema), asyncHandler(controller.makePick));

  // Auto-pick best available (timer expired or commissioner override)
  router.post('/:draftId/autopick', asyncHandler(controller.autoPick));

  // Toggle auto-pick mode for the current user
  router.post('/:draftId/autopick/toggle', asyncHandler(controller.toggleAutoPick));

  // Auction: Nominate a player with starting bid
  router.post('/:draftId/nominate', validate(nominateDraftPickSchema), asyncHandler(controller.nominate));

  // Auction: Place a bid on current nomination
  router.post('/:draftId/bid', strictLimiter, validate(placeBidSchema), asyncHandler(controller.bid));

  // Auction: Resolve expired nomination (timer triggered by client)
  router.post('/:draftId/resolve', asyncHandler(controller.resolveNomination));

  // Auction: Auto-nominate when nomination timer expires
  router.post('/:draftId/autonominate', asyncHandler(controller.autoNominate));

  // Available players (best available, filterable)
  router.get('/:draftId/available', validate(availablePlayersQuerySchema, 'query'), asyncHandler(controller.getAvailablePlayers));

  // Queue management
  router.get('/:draftId/queue', asyncHandler(controller.getQueue));
  router.put('/:draftId/queue', validate(setDraftQueueSchema), asyncHandler(controller.setQueue));
  router.post('/:draftId/queue', validate(addToQueueSchema), asyncHandler(controller.addToQueue));
  router.patch('/:draftId/queue/:playerId', validate(updateQueueMaxBidSchema), asyncHandler(controller.updateQueueMaxBid));
  router.delete('/:draftId/queue/:playerId', asyncHandler(controller.removeFromQueue));

  // Slow auction
  router.get('/:draftId/lots', asyncHandler(controller.getSlowAuctionLots));
  router.get('/:draftId/lots/:lotId/history', asyncHandler(controller.getSlowAuctionLotHistory));
  router.post('/:draftId/lots', validate(slowNominateSchema), asyncHandler(controller.slowNominate));
  router.post('/:draftId/lots/:lotId/bid', strictLimiter, validate(slowSetMaxBidSchema), asyncHandler(controller.slowSetMaxBid));
  router.get('/:draftId/budgets', asyncHandler(controller.getSlowAuctionBudgets));
  router.get('/:draftId/nomination-stats', asyncHandler(controller.getNominationStats));

  // Commissioner draft controls (pause/stop/timers)
  router.post('/:draftId/pause', asyncHandler(controller.pauseDraft));
  router.post('/:draftId/stop', asyncHandler(controller.stopDraft));
  router.put('/:draftId/timers', validate(updateTimersSchema), asyncHandler(controller.updateTimers));

  // Derby (draft order selection)
  router.post('/:draftId/derby/start', asyncHandler(controller.startDerby));
  router.get('/:draftId/derby', asyncHandler(controller.getDerbyState));
  router.post('/:draftId/derby/pick', validate(derbyPickSchema), asyncHandler(controller.makeDerbyPick));
  router.post('/:draftId/derby/autopick', asyncHandler(controller.derbyAutoPick));

  return router;
}
