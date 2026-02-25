'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { ChatMessage, ChatJoinedEvent, ChatErrorEvent } from '@tbdff/shared';

interface ServerToClientEvents {
  'chat:message': (message: ChatMessage) => void;
  'chat:error': (error: ChatErrorEvent) => void;
  'chat:joined': (data: ChatJoinedEvent) => void;
}

interface ClientToServerEvents {
  'chat:join_league': (leagueId: string) => void;
  'chat:leave_league': (leagueId: string) => void;
  'chat:join_dm': (conversationId: string) => void;
  'chat:leave_dm': (conversationId: string) => void;
  'chat:send': (payload: { type: 'league' | 'dm'; roomId: string; content: string }) => void;
}

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketContextValue {
  socket: AppSocket | null;
  isConnected: boolean;
  joinLeague: (leagueId: string) => void;
  leaveLeague: (leagueId: string) => void;
  joinDM: (conversationId: string) => void;
  leaveDM: (conversationId: string) => void;
  sendMessage: (type: 'league' | 'dm', roomId: string, content: string) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

function getSocketUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
  // Strip /api suffix to get the base server URL
  return apiUrl.replace(/\/api\/?$/, '');
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, isAuthenticated } = useAuth();
  const socketRef = useRef<AppSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Disconnect existing socket before creating a new one (handles token refresh)
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socket: AppSocket = io(getSocketUrl(), {
      auth: { token: accessToken },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', (err) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Socket] Connection error:', err.message);
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [isAuthenticated, accessToken]);

  const joinLeague = useCallback((leagueId: string) => {
    socketRef.current?.emit('chat:join_league', leagueId);
  }, []);

  const leaveLeague = useCallback((leagueId: string) => {
    socketRef.current?.emit('chat:leave_league', leagueId);
  }, []);

  const joinDM = useCallback((conversationId: string) => {
    socketRef.current?.emit('chat:join_dm', conversationId);
  }, []);

  const leaveDM = useCallback((conversationId: string) => {
    socketRef.current?.emit('chat:leave_dm', conversationId);
  }, []);

  const sendMessage = useCallback(
    (type: 'league' | 'dm', roomId: string, content: string) => {
      socketRef.current?.emit('chat:send', { type, roomId, content });
    },
    [],
  );

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        joinLeague,
        leaveLeague,
        joinDM,
        leaveDM,
        sendMessage,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
