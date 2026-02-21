'use client';

import { useState, useEffect, useCallback } from 'react';
import { leagueApi, ApiError, type League, type CreateLeagueRequest } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function useLeagues() {
  const { accessToken } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeagues = useCallback(async () => {
    if (!accessToken) {
      setLeagues([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const result = await leagueApi.getMyLeagues(accessToken);
      setLeagues(result.leagues);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to fetch leagues');
      }
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  const createLeague = useCallback(
    async (data: CreateLeagueRequest) => {
      if (!accessToken) throw new Error('Not authenticated');

      const result = await leagueApi.create(data, accessToken);
      setLeagues((prev) => [result.league, ...prev]);
      return result.league;
    },
    [accessToken]
  );

  useEffect(() => {
    fetchLeagues();
  }, [fetchLeagues]);

  return {
    leagues,
    isLoading,
    error,
    createLeague,
    refetch: fetchLeagues,
  };
}
