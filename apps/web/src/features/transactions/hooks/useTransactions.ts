'use client';

import { useCallback } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { transactionApi } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

const PAGE_SIZE = 25;

export function useTransactions(leagueId: string, typeFilter?: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['transactions', leagueId, typeFilter ?? 'all'],
    queryFn: ({ pageParam = 0 }) =>
      transactionApi.list(leagueId, accessToken!, {
        type: typeFilter,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    enabled: !!accessToken,
    initialPageParam: 0,
    getNextPageParam: (_lastPage, allPages) => {
      const total = allPages[0]?.total ?? 0;
      const loaded = allPages.reduce((sum, p) => sum + p.transactions.length, 0);
      return loaded < total ? loaded : undefined;
    },
  });

  // Flatten all pages into a single list
  const transactions = data?.pages.flatMap((p) => p.transactions) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const playerNames: Record<string, string> = {};
  for (const page of data?.pages ?? []) {
    Object.assign(playerNames, page.player_names);
  }

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
    transactions,
    total,
    playerNames,
    isLoading,
    isFetchingNextPage,
    error: queryError ? (queryError as Error).message : null,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    addPlayer,
    dropPlayer,
  };
}
