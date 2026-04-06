import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { ChatService } from './chat.service';
import { InvalidCredentialsException, ValidationException } from '../../shared/exceptions';
import { getMessagesSchema, StartConversationInput } from './chat.schemas';

export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  getLeagueMessages = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;

    const parsed = getMessagesSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationException(parsed.error.issues.map((e) => e.message).join(', '));
    }
    const { limit, before, after } = parsed.data;

    const messages = await this.chatService.getLeagueMessages(
      leagueId,
      userId,
      limit,
      before ?? null,
      after ?? null,
    );

    res.status(200).json({
      messages: messages.map((m) => m.toSafeObject()),
      limit,
      before: before ?? null,
      after: after ?? null,
    });
  };

  getMyConversations = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const conversations = await this.chatService.getMyConversations(userId);
    res.status(200).json({ conversations: conversations.map((c) => c.toSafeObject()) });
  };

  getOrCreateConversation = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const { user_id: targetUserId } = req.body as StartConversationInput;
    const conversation = await this.chatService.getOrCreateConversation(userId, targetUserId);
    res.status(200).json({ conversation: conversation.toSafeObject() });
  };

  getConversationMessages = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const conversationId = Array.isArray(req.params.conversationId)
      ? req.params.conversationId[0]
      : req.params.conversationId;

    const parsed = getMessagesSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationException(parsed.error.issues.map((e) => e.message).join(', '));
    }
    const { limit, before, after } = parsed.data;

    const messages = await this.chatService.getConversationMessages(
      conversationId,
      userId,
      limit,
      before ?? null,
      after ?? null,
    );

    res.status(200).json({
      messages: messages.map((m) => m.toSafeObject()),
      limit,
      before: before ?? null,
      after: after ?? null,
    });
  };
}
