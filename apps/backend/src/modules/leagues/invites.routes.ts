import { Router } from 'express';
import { LeagueController } from './leagues.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';

/**
 * Invites routes (global scope, not under /leagues/:leagueId)
 * Mounted at /api/invites in server.ts
 */
export function createInviteRoutes(controller: LeagueController): Router {
  const router = Router();

  // All invite routes require authentication
  router.use(authMiddleware);

  // Get current user's pending invites
  router.get('/pending', asyncHandler(controller.getMyInvites));

  // Accept an invite
  router.post('/:inviteId/accept', asyncHandler(controller.acceptInvite));

  // Decline or cancel an invite
  router.delete('/:inviteId', asyncHandler(controller.cancelOrDeclineInvite));

  return router;
}
