'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tradeApi } from '@/lib/api';
import type { ProposeTradeRequest, CounterTradeRequest } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function useTrades(leagueId: string, status?: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: tradesData, isLoading, error: queryError } = useQuery({
    queryKey: ['trades', leagueId, status ?? 'all'],
    queryFn: () => tradeApi.list(leagueId, accessToken!, status ? { status } : undefined),
    enabled: !!accessToken,
  });

  const { data: picksData, error: picksQueryError } = useQuery({
    queryKey: ['futurePicks', leagueId],
    queryFn: () => tradeApi.getFuturePicks(leagueId, accessToken!),
    enabled: !!accessToken,
  });

  const invalidateTrades = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['trades', leagueId] });
  }, [leagueId, queryClient]);

  const proposeTrade = useCallback(async (data: ProposeTradeRequest) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.propose(leagueId, data, accessToken);
    invalidateTrades();
    return result.trade;
  }, [leagueId, accessToken, invalidateTrades]);

  const acceptTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.accept(tradeId, accessToken);
    invalidateTrades();
    if (result.trade.status === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['rosters', leagueId] });
      queryClient.invalidateQueries({ queryKey: ['futurePicks', leagueId] });
    }
    return result.trade;
  }, [leagueId, accessToken, invalidateTrades, queryClient]);

  const declineTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.decline(tradeId, accessToken);
    invalidateTrades();
    return result.trade;
  }, [accessToken, invalidateTrades]);

  const withdrawTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.withdraw(tradeId, accessToken);
    invalidateTrades();
    return result.trade;
  }, [accessToken, invalidateTrades]);

  const counterTrade = useCallback(async (tradeId: string, data: CounterTradeRequest) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.counter(tradeId, data, accessToken);
    invalidateTrades();
    return result.trade;
  }, [accessToken, invalidateTrades]);

  const vetoTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.veto(tradeId, accessToken);
    invalidateTrades();
    return result.trade;
  }, [accessToken, invalidateTrades]);

  const pushTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.push(tradeId, accessToken);
    invalidateTrades();
    if (result.trade.status === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['rosters', leagueId] });
      queryClient.invalidateQueries({ queryKey: ['futurePicks', leagueId] });
    }
    return result.trade;
  }, [leagueId, accessToken, invalidateTrades, queryClient]);

  return {
    trades: tradesData?.trades ?? [],
    futurePicks: picksData?.picks ?? [],
    isLoading,
    error: queryError ? (queryError as Error).message : null,
    picksError: picksQueryError ? (picksQueryError as Error).message : null,
    invalidateTrades,
    fetchFuturePicks: () => queryClient.invalidateQueries({ queryKey: ['futurePicks', leagueId] }),
    proposeTrade,
    acceptTrade,
    declineTrade,
    withdrawTrade,
    counterTrade,
    vetoTrade,
    pushTrade,
  };
}
