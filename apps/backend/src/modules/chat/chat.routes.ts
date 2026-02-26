import { Router } from 'express';
import { ChatController } from './chat.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { userMutationLimiter } from '../../middleware/rate-limit.middleware';
import { asyncHandler } from '../../shared/async-handler';
import { validate } from '../../shared/validate';
import { startConversationSchema } from './chat.schemas';

// Mounted at /api/leagues — handles /:leagueId/chat/messages
export function createLeagueChatRoutes(controller: ChatController): Router {
  const router = Router();
  router.use(authMiddleware);
  // Query params (limit, before) are parsed in the controller
  router.get('/:leagueId/chat/messages', asyncHandler(controller.getLeagueMessages));
  return router;
}

// Mounted at /api/conversations
export function createConversationRoutes(controller: ChatController): Router {
  const router = Router();
  router.use(authMiddleware);
  router.use(userMutationLimiter);
  router.get('/', asyncHandler(controller.getMyConversations));
  router.post('/', validate(startConversationSchema), asyncHandler(controller.getOrCreateConversation));
  // Query params (limit, before) are parsed in the controller
  router.get('/:conversationId/messages', asyncHandler(controller.getConversationMessages));
  return router;
}
