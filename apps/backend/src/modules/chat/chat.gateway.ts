import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { config } from '../../config';
import { verifyToken } from '../../shared/jwt';
import { ChatService } from './chat.service';

interface ServerToClientEvents {
  'chat:message': (message: Record<string, unknown>) => void;
  'chat:error': (error: { message: string }) => void;
  'chat:joined': (data: { type: string; roomId: string }) => void;
}

interface ClientToServerEvents {
  'chat:join_league': (leagueId: string) => void;
  'chat:leave_league': (leagueId: string) => void;
  'chat:join_dm': (conversationId: string) => void;
  'chat:send': (payload: { type: 'league' | 'dm'; roomId: string; content: string }) => void;
}

interface SocketData {
  userId: string;
  username: string;
}

export function createChatGateway(
  httpServer: HttpServer,
  chatService: ChatService,
): SocketServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> {
  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    httpServer,
    {
      cors: {
        origin: config.CORS_ORIGINS,
        credentials: true,
      },
      path: '/socket.io',
    },
  );

  // Auth middleware — runs before every connection
  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string }).token;
    if (!token) {
      return next(new Error('UNAUTHORIZED'));
    }
    try {
      const payload = verifyToken(token);
      if (payload.type !== 'access') {
        return next(new Error('UNAUTHORIZED'));
      }
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', async (socket) => {
    const { userId } = socket.data;

    // Auto-join all DM rooms for this user on connect
    try {
      const conversationIds = await chatService.getUserConversationIds(userId);
      for (const id of conversationIds) {
        socket.join(`dm:${id}`);
      }
    } catch {
      // Non-fatal — user simply won't be in DM rooms until they open a conversation
    }

    // Client requests to join a league chat room
    socket.on('chat:join_league', async (leagueId) => {
      try {
        if (typeof leagueId !== 'string' || !leagueId) {
          socket.emit('chat:error', { message: 'Invalid league ID' });
          return;
        }
        const isMember = await chatService.validateLeagueMembership(leagueId, userId);
        if (!isMember) {
          socket.emit('chat:error', { message: 'You are not a member of this league' });
          return;
        }
        socket.join(`league:${leagueId}`);
        socket.emit('chat:joined', { type: 'league', roomId: leagueId });
      } catch {
        socket.emit('chat:error', { message: 'Failed to join league chat' });
      }
    });

    // Client leaves a league chat room (e.g. navigates away)
    socket.on('chat:leave_league', (leagueId) => {
      socket.leave(`league:${leagueId}`);
    });

    // Client joins a DM room (called when opening a conversation)
    socket.on('chat:join_dm', async (conversationId) => {
      try {
        if (typeof conversationId !== 'string' || !conversationId) {
          socket.emit('chat:error', { message: 'Invalid conversation ID' });
          return;
        }
        // Validate participant by checking messages access (throws if not a participant)
        await chatService.getConversationMessages(conversationId, userId, 1, null);
        socket.join(`dm:${conversationId}`);
        socket.emit('chat:joined', { type: 'dm', roomId: conversationId });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to join conversation';
        socket.emit('chat:error', { message });
      }
    });

    // Client sends a message
    socket.on('chat:send', async (payload) => {
      try {
        if (!payload || typeof payload.content !== 'string' || !payload.roomId) {
          socket.emit('chat:error', { message: 'Invalid message payload' });
          return;
        }

        if (payload.type === 'league') {
          const message = await chatService.sendLeagueMessage(payload.roomId, userId, payload.content);
          io.to(`league:${payload.roomId}`).emit('chat:message', message.toSafeObject() as Record<string, unknown>);
        } else if (payload.type === 'dm') {
          const message = await chatService.sendConversationMessage(payload.roomId, userId, payload.content);
          io.to(`dm:${payload.roomId}`).emit('chat:message', message.toSafeObject() as Record<string, unknown>);
        } else {
          socket.emit('chat:error', { message: 'Invalid message type' });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        socket.emit('chat:error', { message });
      }
    });
  });

  return io;
}
