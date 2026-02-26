import { Router } from 'express';
import { TradeController } from './trades.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { strictLimiter, userMutationLimiter } from '../../middleware/rate-limit.middleware';
import { asyncHandler } from '../../shared/async-handler';
import { validate } from '../../shared/validate';
import { proposeTradeSchema, counterTradeSchema, tradeListQuerySchema } from './trades.schemas';

/**
 * League-scoped trade routes
 * Mounted at /api/leagues
 */
export function createLeagueTradeRoutes(controller: TradeController): Router {
  const router = Router();
  router.use(authMiddleware);
  router.use(userMutationLimiter);

  router.post('/:leagueId/trades', strictLimiter, validate(proposeTradeSchema), asyncHandler(controller.propose));
  router.get('/:leagueId/trades', validate(tradeListQuerySchema, 'query'), asyncHandler(controller.list));
  router.get('/:leagueId/future-picks', asyncHandler(controller.getFuturePicks));
  router.get('/:leagueId/future-picks/:userId', asyncHandler(controller.getUserFuturePicks));

  return router;
}

/**
 * Trade-scoped routes (direct access by trade ID)
 * Mounted at /api/trades
 */
export function createTradeRoutes(controller: TradeController): Router {
  const router = Router();
  router.use(authMiddleware);
  router.use(userMutationLimiter);

  router.get('/:tradeId', asyncHandler(controller.getById));
  router.post('/:tradeId/accept', strictLimiter, asyncHandler(controller.accept));
  router.post('/:tradeId/decline', asyncHandler(controller.decline));
  router.post('/:tradeId/withdraw', asyncHandler(controller.withdraw));
  router.post('/:tradeId/counter', strictLimiter, validate(counterTradeSchema), asyncHandler(controller.counter));
  router.post('/:tradeId/veto', asyncHandler(controller.veto));
  router.post('/:tradeId/push', asyncHandler(controller.push));

  return router;
}
