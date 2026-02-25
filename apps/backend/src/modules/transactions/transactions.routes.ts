import { Router } from 'express';
import { TransactionController } from './transactions.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import { validate } from '../../shared/validate';
import {
  addPlayerSchema,
  dropPlayerSchema,
  placeWaiverClaimSchema,
  updateWaiverClaimSchema,
  transactionListQuerySchema,
} from './transactions.schemas';

/**
 * League-scoped transaction routes
 * Mounted at /api/leagues
 */
export function createLeagueTransactionRoutes(controller: TransactionController): Router {
  const router = Router();
  router.use(authMiddleware);

  // Activity feed
  router.get('/:leagueId/transactions', validate(transactionListQuerySchema, 'query'), asyncHandler(controller.list));

  // Add/Drop
  router.post('/:leagueId/add', validate(addPlayerSchema), asyncHandler(controller.addPlayer));
  router.post('/:leagueId/drop', validate(dropPlayerSchema), asyncHandler(controller.dropPlayer));

  // Waivers
  router.get('/:leagueId/waivers', asyncHandler(controller.getWaiverClaims));
  router.post('/:leagueId/waivers', validate(placeWaiverClaimSchema), asyncHandler(controller.placeWaiverClaim));
  router.put('/:leagueId/waivers/:claimId', validate(updateWaiverClaimSchema), asyncHandler(controller.updateWaiverClaim));
  router.delete('/:leagueId/waivers/:claimId', asyncHandler(controller.cancelWaiverClaim));

  return router;
}
