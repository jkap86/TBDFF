import { ChatRepository } from './chat.repository';
import { Message, Conversation } from './chat.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
} from '../../shared/exceptions';

export class ChatService {
  constructor(private readonly chatRepository: ChatRepository) {}

  async getLeagueMessages(
    leagueId: string,
    userId: string,
    limit: number,
    before: string | null,
  ): Promise<Message[]> {
    const isMember = await this.chatRepository.isLeagueMember(leagueId, userId);
    if (!isMember) throw new ForbiddenException('You are not a member of this league');

    const clampedLimit = Math.min(Math.max(limit, 1), 100);
    return this.chatRepository.findLeagueMessages(leagueId, clampedLimit, before);
  }

  async getConversationMessages(
    conversationId: string,
    userId: string,
    limit: number,
    before: string | null,
  ): Promise<Message[]> {
    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found');

    if (conversation.userAId !== userId && conversation.userBId !== userId) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    const clampedLimit = Math.min(Math.max(limit, 1), 100);
    return this.chatRepository.findConversationMessages(conversationId, clampedLimit, before);
  }

  async getOrCreateConversation(requestingUserId: string, targetUserId: string): Promise<Conversation> {
    if (requestingUserId === targetUserId) {
      throw new ValidationException('You cannot start a conversation with yourself');
    }
    return this.chatRepository.findOrCreateConversation(requestingUserId, targetUserId);
  }

  async getMyConversations(userId: string): Promise<Conversation[]> {
    return this.chatRepository.findConversationsByUserId(userId);
  }

  async sendLeagueMessage(leagueId: string, userId: string, content: string): Promise<Message> {
    const isMember = await this.chatRepository.isLeagueMember(leagueId, userId);
    if (!isMember) throw new ForbiddenException('You are not a member of this league');

    const trimmed = content?.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 1000) {
      throw new ValidationException('Message content must be between 1 and 1000 characters');
    }

    return this.chatRepository.createMessage({ leagueId, senderId: userId, content: trimmed });
  }

  async sendConversationMessage(conversationId: string, userId: string, content: string): Promise<Message> {
    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found');

    if (conversation.userAId !== userId && conversation.userBId !== userId) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    const trimmed = content?.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 1000) {
      throw new ValidationException('Message content must be between 1 and 1000 characters');
    }

    return this.chatRepository.createMessage({ conversationId, senderId: userId, content: trimmed });
  }

  async validateLeagueMembership(leagueId: string, userId: string): Promise<boolean> {
    return this.chatRepository.isLeagueMember(leagueId, userId);
  }

  async getUserConversationIds(userId: string): Promise<string[]> {
    const conversations = await this.chatRepository.findConversationsByUserId(userId);
    return conversations.map((c) => c.id);
  }
}
