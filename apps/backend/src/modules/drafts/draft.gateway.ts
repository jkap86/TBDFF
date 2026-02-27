import { Server as SocketServer } from 'socket.io';
import { Draft, DraftPick } from './drafts.model';
import { DraftRepository } from './drafts.repository';
import { ChatService } from '../chat/chat.service';

export interface DraftStateUpdate {
  draft: Draft;
  pick?: DraftPick;
  chained_picks?: DraftPick[];
}

export class DraftGateway {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly io: SocketServer<any, any, any, any>,
    private readonly draftRepo: DraftRepository,
    private readonly chatService: ChatService,
  ) {
    // Register draft room join/leave handlers on every new connection
    this.io.on('connection', (socket) => {
      socket.on('draft:join', async (draftId: string) => {
        if (typeof draftId !== 'string' || !draftId) return;

        try {
          const draft = await this.draftRepo.findById(draftId);
          if (!draft) return;

          const isMember = await this.chatService.validateLeagueMembership(
            draft.leagueId,
            socket.data.userId,
          );
          if (!isMember) return;

          socket.join(`draft:${draftId}`);
        } catch {
          // Silently reject — user won't receive draft events
        }
      });

      socket.on('draft:leave', (draftId: string) => {
        if (typeof draftId === 'string' && draftId) {
          socket.leave(`draft:${draftId}`);
        }
      });
    });
  }

  /** Broadcast a draft state update to all clients in the draft's room */
  broadcast(draftId: string, event: string, data: DraftStateUpdate): void {
    this.io.to(`draft:${draftId}`).emit(event, {
      draft: data.draft.toSafeObject(),
      pick: data.pick?.toSafeObject(),
      chained_picks: data.chained_picks?.map((p) => p.toSafeObject()),
    });
  }

  /** Broadcast a slow auction event to all clients in the draft room */
  broadcastSlowAuction(draftId: string, event: string, data: Record<string, any>): void {
    this.io.to(`draft:${draftId}`).emit(event, data);
  }

  /** Send an event to a specific user (e.g., outbid notification) */
  broadcastToUser(userId: string, event: string, data: Record<string, any>): void {
    this.io.to(`user:${userId}`).emit(event, data);
  }
}

export function createDraftGateway(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  io: SocketServer<any, any, any, any>,
  draftRepo: DraftRepository,
  chatService: ChatService,
): DraftGateway {
  return new DraftGateway(io, draftRepo, chatService);
}
