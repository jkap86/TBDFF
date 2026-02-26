import { Router } from 'express';
import { LeagueController } from './leagues.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { userMutationLimiter } from '../../middleware/rate-limit.middleware';
import { asyncHandler } from '../../shared/async-handler';
import { validate } from '../../shared/validate';
import { updateLeagueSchema, createInviteSchema } from './leagues.schemas';

export function createLeagueRoutes(controller: LeagueController): Router {
  const router = Router();

  // ---- PUBLIC ROUTES (no auth) ----

  // Get public leagues
  router.get('/public', asyncHandler(controller.getPublicLeagues));

  // ---- AUTHENTICATED ROUTES ----

  // Apply auth middleware to all routes below this point
  router.use(authMiddleware);
  router.use(userMutationLimiter);

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

  // Rosters
  router.get('/:leagueId/rosters', asyncHandler(controller.getRosters));
  router.put('/:leagueId/rosters/:rosterId/assign', asyncHandler(controller.assignRoster));
  router.delete('/:leagueId/rosters/:rosterId/assign', asyncHandler(controller.unassignRoster));

  // League invites management
  router.post('/:leagueId/invites', validate(createInviteSchema), asyncHandler(controller.createInvite));
  router.get('/:leagueId/invites', asyncHandler(controller.getLeagueInvites));

  return router;
}
