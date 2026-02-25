'use client';

import { useEffect } from 'react';
import { useSocket } from '@/features/chat/context/SocketProvider';
import type { TradeProposal } from '@/lib/api';

export function useTradeSocket(
  leagueId: string,
  onTradeUpdate: (trade: TradeProposal) => void,
) {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    const events = [
      'trade:proposed',
      'trade:accepted',
      'trade:declined',
      'trade:countered',
      'trade:completed',
      'trade:vetoed',
    ];

    const handler = (data: { trade: TradeProposal }) => {
      if (data.trade?.league_id === leagueId) {
        onTradeUpdate(data.trade);
      }
    };

    for (const event of events) {
      socket.on(event as any, handler);
    }

    return () => {
      for (const event of events) {
        socket.off(event as any, handler);
      }
    };
  }, [socket, leagueId, onTradeUpdate]);
}
