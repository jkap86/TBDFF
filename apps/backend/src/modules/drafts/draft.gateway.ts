import { Server as SocketServer } from 'socket.io';
import { Draft, DraftPick } from './drafts.model';

export interface DraftStateUpdate {
  draft: Draft;
  pick?: DraftPick;
  chained_picks?: DraftPick[];
}

export class DraftGateway {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly io: SocketServer<any, any, any, any>) {
    // Register draft room join/leave handlers on every new connection
    this.io.on('connection', (socket) => {
      socket.on('draft:join', (draftId: string) => {
        if (typeof draftId === 'string' && draftId) {
          socket.join(`draft:${draftId}`);
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDraftGateway(io: SocketServer<any, any, any, any>): DraftGateway {
  return new DraftGateway(io);
}
