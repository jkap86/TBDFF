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
import type { ChatMessage, ChatJoinedEvent, ChatErrorEvent, Draft, DraftPick, AuctionLot, MatchupDerbyState } from '@tbdff/shared';

interface DraftStateUpdate {
  draft: Draft;
  pick?: DraftPick;
  chained_picks?: DraftPick[];
}

interface ServerToClientEvents {
  'chat:message': (message: ChatMessage) => void;
  'chat:error': (error: ChatErrorEvent) => void;
  'chat:joined': (data: ChatJoinedEvent) => void;
  'draft:state_updated': (data: DraftStateUpdate) => void;
  'slow_auction:lot_created': (data: { lot: AuctionLot }) => void;
  'slow_auction:lot_updated': (data: { lot: AuctionLot }) => void;
  'slow_auction:lot_won': (data: { lot: AuctionLot; winner_roster_id: number; price: number }) => void;
  'slow_auction:lot_passed': (data: { lot: AuctionLot }) => void;
  'slow_auction:outbid': (data: { lot_id: string; player_id: string; new_bid: number }) => void;
  'matchup_derby:state_updated': (data: { derby: MatchupDerbyState; server_time: string }) => void;
  // Transaction / trade events broadcast to league rooms
  'transaction:new': (data: { transaction: Record<string, unknown> }) => void;
  'waiver:processed': (data: { league_id: string }) => void;
  'roster:updated': (data: { league_id: string }) => void;
  'trade:proposed': (data: { trade: Record<string, unknown> }) => void;
  'trade:accepted': (data: { trade: Record<string, unknown> }) => void;
  'trade:declined': (data: { trade: Record<string, unknown> }) => void;
  'trade:countered': (data: { trade: Record<string, unknown> }) => void;
  'trade:completed': (data: { trade: Record<string, unknown> }) => void;
  'trade:vetoed': (data: { trade: Record<string, unknown> }) => void;
  'trade:withdrawn': (data: { trade: Record<string, unknown> }) => void;
}

interface ClientToServerEvents {
  'chat:join_league': (leagueId: string) => void;
  'chat:leave_league': (leagueId: string) => void;
  'chat:join_dm': (conversationId: string) => void;
  'chat:leave_dm': (conversationId: string) => void;
  'chat:send': (payload: { type: 'league' | 'dm'; roomId: string; content: string }) => void;
  'draft:join': (draftId: string) => void;
  'draft:leave': (draftId: string) => void;
  'matchup_derby:join': (leagueId: string) => void;
  'matchup_derby:leave': (leagueId: string) => void;
}

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface SocketContextValue {
  socket: AppSocket | null;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
        setConnectionStatus('disconnected');
      }
      return;
    }

    // Disconnect existing socket before creating a new one (handles token refresh)
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    setConnectionStatus('connecting');

    const socket: AppSocket = io(getSocketUrl(), {
      auth: { token: accessToken },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      setConnectionStatus('connected');
    });
    socket.on('disconnect', () => {
      setIsConnected(false);
      setConnectionStatus('disconnected');
    });
    socket.on('connect_error', (err) => {
      setConnectionStatus('disconnected');
      if (process.env.NODE_ENV === 'development') {
        console.error('[Socket] Connection error:', err.message);
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setConnectionStatus('disconnected');
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
        connectionStatus,
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
