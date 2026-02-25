'use client';

import { useState, useEffect, useCallback } from 'react';
import { transactionApi, ApiError } from '@/lib/api';
import type { Transaction } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function useTransactions(leagueId: string) {
  const { accessToken } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async (params?: { type?: string; limit?: number; offset?: number }) => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      setError(null);
      const result = await transactionApi.list(leagueId, accessToken, params);
      setTransactions(result.transactions);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load transactions');
    } finally {
      setIsLoading(false);
    }
  }, [leagueId, accessToken]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const addPlayer = useCallback(async (playerId: string, dropPlayerId?: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await transactionApi.addPlayer(leagueId, { player_id: playerId, drop_player_id: dropPlayerId }, accessToken);
    return result.transaction;
  }, [leagueId, accessToken]);

  const dropPlayer = useCallback(async (playerId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await transactionApi.dropPlayer(leagueId, { player_id: playerId }, accessToken);
    return result.transaction;
  }, [leagueId, accessToken]);

  return {
    transactions,
    total,
    isLoading,
    error,
    fetchTransactions,
    addPlayer,
    dropPlayer,
  };
}
