'use client';

import { useQuery } from '@tanstack/react-query';
import { leagueApi, matchupApi, scoringApi } from '@/lib/api';
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

export function useMatchupsQuery(leagueId: string) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ['matchups', leagueId],
    queryFn: () => matchupApi.getAll(leagueId, accessToken!),
    enabled: !!accessToken,
    select: (data) => data.matchups,
  });
}

export function useScoresQuery(leagueId: string, week: number) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ['scores', leagueId, week],
    queryFn: () => scoringApi.getLeagueScores(leagueId, week, accessToken!),
    enabled: !!accessToken && week > 0,
    select: (data) => data.scores,
  });
}

export function useLiveScoresQuery(leagueId: string, week: number) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ['liveScores', leagueId, week],
    queryFn: () => scoringApi.getLiveScores(leagueId, week, accessToken!),
    enabled: !!accessToken && week > 0,
    refetchInterval: 30_000,
  });
}
