'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tradeApi } from '@/lib/api';
import type { ProposeTradeRequest, CounterTradeRequest } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function useTrades(leagueId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: tradesData, isLoading, error: queryError } = useQuery({
    queryKey: ['trades', leagueId],
    queryFn: () => tradeApi.list(leagueId, accessToken!),
    enabled: !!accessToken,
  });

  const { data: picksData, error: picksQueryError } = useQuery({
    queryKey: ['futurePicks', leagueId],
    queryFn: () => tradeApi.getFuturePicks(leagueId, accessToken!),
    enabled: !!accessToken,
  });

  const fetchTrades = useCallback(async (status?: string) => {
    if (!accessToken) return;
    if (status) {
      // For filtered fetches, do a manual fetch and update cache
      const result = await tradeApi.list(leagueId, accessToken, { status });
      queryClient.setQueryData(['trades', leagueId], result);
    } else {
      queryClient.invalidateQueries({ queryKey: ['trades', leagueId] });
    }
  }, [leagueId, accessToken, queryClient]);

  const invalidateTrades = () => queryClient.invalidateQueries({ queryKey: ['trades', leagueId] });

  const proposeTrade = useCallback(async (data: ProposeTradeRequest) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.propose(leagueId, data, accessToken);
    invalidateTrades();
    return result.trade;
  }, [leagueId, accessToken]);

  const acceptTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.accept(tradeId, accessToken);
    invalidateTrades();
    return result.trade;
  }, [accessToken]);

  const declineTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.decline(tradeId, accessToken);
    invalidateTrades();
    return result.trade;
  }, [accessToken]);

  const withdrawTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.withdraw(tradeId, accessToken);
    invalidateTrades();
    return result.trade;
  }, [accessToken]);

  const counterTrade = useCallback(async (tradeId: string, data: CounterTradeRequest) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.counter(tradeId, data, accessToken);
    invalidateTrades();
    return result.trade;
  }, [accessToken]);

  const vetoTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.veto(tradeId, accessToken);
    invalidateTrades();
    return result.trade;
  }, [accessToken]);

  const pushTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.push(tradeId, accessToken);
    invalidateTrades();
    return result.trade;
  }, [accessToken]);

  return {
    trades: tradesData?.trades ?? [],
    futurePicks: picksData?.picks ?? [],
    isLoading,
    error: queryError ? (queryError as Error).message : null,
    picksError: picksQueryError ? (picksQueryError as Error).message : null,
    fetchTrades,
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
