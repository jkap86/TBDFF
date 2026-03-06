'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useChatPanel } from '../context/ChatPanelContext';
import { useSocket } from '../context/SocketProvider';

export function LeagueIdSync() {
  const params = useParams();
  const { setLeagueId } = useChatPanel();
  const { socket, isConnected } = useSocket();
  const leagueId = (params?.leagueId as string) ?? null;

  useEffect(() => {
    setLeagueId(leagueId);
  }, [leagueId, setLeagueId]);

  // Join/leave league Socket.IO room independently of chat panel state.
  // This ensures trade, transaction, roster, and waiver events are received
  // on any league page, not only when the chat panel is open.
  useEffect(() => {
    if (!socket || !isConnected || !leagueId) return;

    socket.emit('chat:join_league', leagueId);

    return () => {
      socket.emit('chat:leave_league', leagueId);
    };
  }, [socket, isConnected, leagueId]);

  return null;
}
