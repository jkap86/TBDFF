import { Router } from 'express';
import { Pool } from 'pg';
import { LeagueController } from './leagues.controller';
import { LeagueService } from './leagues.service';
import { LeagueRepository } from './leagues.repository';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import { validate } from '../../shared/validate';
import { updateLeagueSchema } from './leagues.schemas';

export function createLeagueRoutes(pool: Pool): Router {
  const leagueRepository = new LeagueRepository(pool);
  const leagueService = new LeagueService(leagueRepository);
  const controller = new LeagueController(leagueService);

  const router = Router();

  // All league routes require authentication
  router.use(authMiddleware);

  // League CRUD
  router.post('/', asyncHandler(controller.create));
  router.get('/', asyncHandler(controller.getMyLeagues));
  router.get('/:leagueId', asyncHandler(controller.getById));
  router.put('/:leagueId', validate(updateLeagueSchema), asyncHandler(controller.update));
  router.delete('/:leagueId', asyncHandler(controller.delete));

  // Member management
  router.get('/:leagueId/members', asyncHandler(controller.getMembers));
  router.post('/:leagueId/members', asyncHandler(controller.join));
  router.delete('/:leagueId/members/me', asyncHandler(controller.leave));
  router.delete('/:leagueId/members/:userId', asyncHandler(controller.removeMember));
  router.put('/:leagueId/members/:userId', asyncHandler(controller.updateMemberRole));

  return router;
}
