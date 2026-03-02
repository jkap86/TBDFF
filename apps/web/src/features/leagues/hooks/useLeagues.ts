'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leagueApi, type CreateLeagueRequest } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function useLeagues() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ['leagues'],
    queryFn: () => leagueApi.getMyLeagues(accessToken!),
    enabled: !!accessToken,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateLeagueRequest) => {
      if (!accessToken) throw new Error('Not authenticated');
      return leagueApi.create(data, accessToken);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues'] });
    },
  });

  const createLeague = async (data: CreateLeagueRequest) => {
    const result = await createMutation.mutateAsync(data);
    return result.league;
  };

  return {
    leagues: data?.leagues ?? [],
    isLoading,
    error: queryError ? (queryError as Error).message : null,
    createLeague,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['leagues'] }),
  };
}
