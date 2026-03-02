'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { transactionApi } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function useTransactions(leagueId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [filterParams, setFilterParams] = useState<{ type?: string; limit?: number; offset?: number } | undefined>();

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ['transactions', leagueId, filterParams],
    queryFn: () => transactionApi.list(leagueId, accessToken!, filterParams),
    enabled: !!accessToken,
  });

  const fetchTransactions = useCallback((params?: { type?: string; limit?: number; offset?: number }) => {
    setFilterParams(params);
  }, []);

  const addPlayer = useCallback(async (playerId: string, dropPlayerId?: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await transactionApi.addPlayer(leagueId, { player_id: playerId, drop_player_id: dropPlayerId }, accessToken);
    queryClient.invalidateQueries({ queryKey: ['rosters', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['transactions', leagueId] });
    return result.transaction;
  }, [leagueId, accessToken, queryClient]);

  const dropPlayer = useCallback(async (playerId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await transactionApi.dropPlayer(leagueId, { player_id: playerId }, accessToken);
    queryClient.invalidateQueries({ queryKey: ['rosters', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['transactions', leagueId] });
    return result.transaction;
  }, [leagueId, accessToken, queryClient]);

  return {
    transactions: data?.transactions ?? [],
    total: data?.total ?? 0,
    playerNames: data?.player_names ?? {},
    isLoading,
    error: queryError ? (queryError as Error).message : null,
    fetchTransactions,
    addPlayer,
    dropPlayer,
  };
}
