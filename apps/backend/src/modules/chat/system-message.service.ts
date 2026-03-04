import { Server as SocketServer } from 'socket.io';
import { ChatRepository } from './chat.repository';

export class SystemMessageService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private io: SocketServer<any, any, any, any> | null = null;

  constructor(private readonly chatRepository: ChatRepository) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setIO(io: SocketServer<any, any, any, any>): void {
    this.io = io;
  }

  async send(
    leagueId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const message = await this.chatRepository.createSystemMessage({
      leagueId,
      content,
      metadata,
    });

    this.io?.to(`league:${leagueId}`).emit(
      'chat:message',
      message.toSafeObject() as Record<string, unknown>,
    );
  }
}
