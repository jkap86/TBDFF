'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useChatPanel } from '@/features/chat/context/ChatPanelContext';
import { useSocket } from '@/features/chat/context/SocketProvider';
import { useActionsPanel } from '@/features/actions/context/ActionsPanelContext';

export function LeagueIdSync() {
  const params = useParams();
  const { setLeagueId: setChatLeagueId } = useChatPanel();
  const { setLeagueId: setActionsLeagueId } = useActionsPanel();
  const { socket, isConnected } = useSocket();
  const leagueId = (params?.leagueId as string) ?? null;

  useEffect(() => {
    setChatLeagueId(leagueId);
  }, [leagueId, setChatLeagueId]);

  useEffect(() => {
    setActionsLeagueId(leagueId);
  }, [leagueId, setActionsLeagueId]);

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
