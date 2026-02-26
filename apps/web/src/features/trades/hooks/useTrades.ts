'use client';

import { useState, useEffect, useCallback } from 'react';
import { tradeApi, ApiError } from '@/lib/api';
import type { TradeProposal, ProposeTradeRequest, CounterTradeRequest, FutureDraftPick } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function useTrades(leagueId: string) {
  const { accessToken } = useAuth();
  const [trades, setTrades] = useState<TradeProposal[]>([]);
  const [futurePicks, setFuturePicks] = useState<FutureDraftPick[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = useCallback(async (status?: string) => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      setError(null);
      const result = await tradeApi.list(leagueId, accessToken, { status });
      setTrades(result.trades);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load trades');
    } finally {
      setIsLoading(false);
    }
  }, [leagueId, accessToken]);

  const fetchFuturePicks = useCallback(async () => {
    if (!accessToken) return;
    try {
      const result = await tradeApi.getFuturePicks(leagueId, accessToken);
      setFuturePicks(result.picks);
    } catch {
      // Future picks are optional; don't block the page on failure
    }
  }, [leagueId, accessToken]);

  useEffect(() => {
    fetchTrades();
    fetchFuturePicks();
  }, [fetchTrades, fetchFuturePicks]);

  const proposeTrade = useCallback(async (data: ProposeTradeRequest) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.propose(leagueId, data, accessToken);
    setTrades((prev) => [result.trade, ...prev]);
    return result.trade;
  }, [leagueId, accessToken]);

  const acceptTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.accept(tradeId, accessToken);
    setTrades((prev) => prev.map((t) => (t.id === tradeId ? result.trade : t)));
    return result.trade;
  }, [accessToken]);

  const declineTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.decline(tradeId, accessToken);
    setTrades((prev) => prev.map((t) => (t.id === tradeId ? result.trade : t)));
    return result.trade;
  }, [accessToken]);

  const withdrawTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.withdraw(tradeId, accessToken);
    setTrades((prev) => prev.map((t) => (t.id === tradeId ? result.trade : t)));
    return result.trade;
  }, [accessToken]);

  const counterTrade = useCallback(async (tradeId: string, data: CounterTradeRequest) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.counter(tradeId, data, accessToken);
    setTrades((prev) => [result.trade, ...prev.map((t) => (t.id === tradeId ? { ...t, status: 'countered' as const } : t))]);
    return result.trade;
  }, [accessToken]);

  const vetoTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.veto(tradeId, accessToken);
    setTrades((prev) => prev.map((t) => (t.id === tradeId ? result.trade : t)));
    return result.trade;
  }, [accessToken]);

  const pushTrade = useCallback(async (tradeId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await tradeApi.push(tradeId, accessToken);
    setTrades((prev) => prev.map((t) => (t.id === tradeId ? result.trade : t)));
    return result.trade;
  }, [accessToken]);

  return {
    trades,
    futurePicks,
    isLoading,
    error,
    fetchTrades,
    fetchFuturePicks,
    proposeTrade,
    acceptTrade,
    declineTrade,
    withdrawTrade,
    counterTrade,
    vetoTrade,
    pushTrade,
  };
}
