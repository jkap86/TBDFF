'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/features/chat/context/SocketProvider';

/**
 * Listens for transaction/waiver/roster socket events and invalidates
 * relevant React Query caches so pages auto-refresh.
 */
export function useTransactionSocket(leagueId: string) {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const handleTransactionNew = () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', leagueId] });
      queryClient.invalidateQueries({ queryKey: ['rosters', leagueId] });
    };

    const handleWaiverProcessed = () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', leagueId] });
      queryClient.invalidateQueries({ queryKey: ['waiverClaims', leagueId] });
      queryClient.invalidateQueries({ queryKey: ['rosters', leagueId] });
    };

    const handleRosterUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['rosters', leagueId] });
    };

    socket.on('transaction:new', handleTransactionNew);
    socket.on('waiver:processed', handleWaiverProcessed);
    socket.on('roster:updated', handleRosterUpdated);

    return () => {
      socket.off('transaction:new', handleTransactionNew);
      socket.off('waiver:processed', handleWaiverProcessed);
      socket.off('roster:updated', handleRosterUpdated);
    };
  }, [socket, leagueId, queryClient]);
}
