import { Server as SocketServer } from 'socket.io';

export class TransactionsGateway {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly io: SocketServer<any, any, any, any>) {}

  /** Broadcast an event to all clients in a league room */
  broadcastToLeague(leagueId: string, event: string, data: Record<string, unknown>): void {
    this.io.to(`league:${leagueId}`).emit(event, data);
  }

  /** Broadcast an event to a specific user */
  broadcastToUser(userId: string, event: string, data: Record<string, unknown>): void {
    this.io.to(`user:${userId}`).emit(event, data);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTransactionsGateway(io: SocketServer<any, any, any, any>): TransactionsGateway {
  return new TransactionsGateway(io);
}
