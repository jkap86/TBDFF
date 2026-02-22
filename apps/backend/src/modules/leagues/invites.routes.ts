import { Router } from 'express';
import { Pool } from 'pg';
import { LeagueController } from './leagues.controller';
import { LeagueService } from './leagues.service';
import { LeagueRepository } from './leagues.repository';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';

/**
 * Invites routes (global scope, not under /leagues/:leagueId)
 * Mounted at /api/invites in server.ts
 */
export function createInviteRoutes(pool: Pool): Router {
  const leagueRepository = new LeagueRepository(pool);
  const leagueService = new LeagueService(leagueRepository);
  const controller = new LeagueController(leagueService);

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
