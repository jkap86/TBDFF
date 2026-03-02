import { Server as SocketServer } from 'socket.io';
import { LeagueRepository } from '../leagues/leagues.repository';

export class MatchupDerbyGateway {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly io: SocketServer<any, any, any, any>,
    private readonly leagueRepo: LeagueRepository,
  ) {
    this.io.on('connection', (socket) => {
      socket.on('matchup_derby:join', async (leagueId: string) => {
        if (typeof leagueId !== 'string' || !leagueId) return;

        try {
          const member = await this.leagueRepo.findMember(leagueId, socket.data.userId);
          if (!member) return;

          socket.join(`matchup_derby:${leagueId}`);
        } catch {
          // Silently reject
        }
      });

      socket.on('matchup_derby:leave', (leagueId: string) => {
        if (typeof leagueId === 'string' && leagueId) {
          socket.leave(`matchup_derby:${leagueId}`);
        }
      });
    });
  }

  broadcast(leagueId: string, event: string, data: Record<string, any>): void {
    this.io.to(`matchup_derby:${leagueId}`).emit(event, data);
  }
}

export function createMatchupDerbyGateway(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  io: SocketServer<any, any, any, any>,
  leagueRepo: LeagueRepository,
): MatchupDerbyGateway {
  return new MatchupDerbyGateway(io, leagueRepo);
}
