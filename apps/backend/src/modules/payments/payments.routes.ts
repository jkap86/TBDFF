import { Router } from 'express';
import { PaymentController } from './payments.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { userMutationLimiter, strictLimiter } from '../../middleware/rate-limit.middleware';
import { asyncHandler } from '../../shared/async-handler';
import { validate } from '../../shared/validate';
import { setBuyInSchema, recordBuyInSchema, setPayoutsSchema } from './payments.schemas';

/**
 * League-scoped payment routes
 * Mounted at /api/leagues
 */
export function createPaymentRoutes(controller: PaymentController): Router {
  const router = Router();
  router.use(authMiddleware);
  router.use(userMutationLimiter);

  router.get('/:leagueId/payments', asyncHandler(controller.getPayments));
  router.put('/:leagueId/payments/buy-in', validate(setBuyInSchema), asyncHandler(controller.setBuyIn));
  router.post('/:leagueId/payments/buy-ins', strictLimiter, validate(recordBuyInSchema), asyncHandler(controller.recordBuyIn));
  router.put('/:leagueId/payments/payouts', validate(setPayoutsSchema), asyncHandler(controller.setPayouts));
  router.delete('/:leagueId/payments/:paymentId', asyncHandler(controller.removePayment));

  return router;
}
