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
      'trade:review',
      'trade:declined',
      'trade:countered',
      'trade:completed',
      'trade:vetoed',
      'trade:withdrawn',
    ] as const;

    const handler = (data: { trade: Record<string, unknown> }) => {
      const trade = data.trade as unknown as TradeProposal;
      if (trade?.league_id === leagueId) {
        onTradeUpdate(trade);
      }
    };

    for (const event of events) {
      socket.on(event, handler);
    }

    return () => {
      for (const event of events) {
        socket.off(event, handler);
      }
    };
  }, [socket, leagueId, onTradeUpdate]);
}
