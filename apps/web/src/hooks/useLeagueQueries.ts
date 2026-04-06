'use client';

import { useQuery } from '@tanstack/react-query';
import { leagueApi } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function useLeagueQuery(leagueId: string) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ['league', leagueId],
    queryFn: () => leagueApi.getById(leagueId, accessToken!),
    enabled: !!accessToken,
    select: (data) => data.league,
    refetchInterval: (query) => {
      const status = (query.state.data as any)?.league?.status;
      return status === 'offseason' ? 30000 : false;
    },
  });
}

export function useMembersQuery(leagueId: string) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ['members', leagueId],
    queryFn: () => leagueApi.getMembers(leagueId, accessToken!),
    enabled: !!accessToken,
    select: (data) => data.members,
  });
}

export function useRostersQuery(leagueId: string) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ['rosters', leagueId],
    queryFn: () => leagueApi.getRosters(leagueId, accessToken!),
    enabled: !!accessToken,
    select: (data) => data.rosters,
  });
}
