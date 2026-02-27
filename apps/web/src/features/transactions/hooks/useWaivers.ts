'use client';

import { useState, useEffect, useCallback } from 'react';
import { transactionApi, ApiError } from '@/lib/api';
import type { WaiverClaim, PlaceWaiverClaimRequest } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function useWaivers(leagueId: string) {
  const { accessToken } = useAuth();
  const [claims, setClaims] = useState<WaiverClaim[]>([]);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClaims = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      setError(null);
      const result = await transactionApi.getWaiverClaims(leagueId, accessToken);
      setClaims(result.claims);
      if (result.player_names) setPlayerNames(result.player_names);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load waiver claims');
    } finally {
      setIsLoading(false);
    }
  }, [leagueId, accessToken]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const placeClaim = useCallback(async (data: PlaceWaiverClaimRequest) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await transactionApi.placeWaiverClaim(leagueId, data, accessToken);
    setClaims((prev) => [...prev, result.claim]);
    return result.claim;
  }, [leagueId, accessToken]);

  const updateClaim = useCallback(async (claimId: string, data: { drop_player_id?: string | null; faab_amount?: number }) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await transactionApi.updateWaiverClaim(leagueId, claimId, data, accessToken);
    setClaims((prev) => prev.map((c) => (c.id === claimId ? result.claim : c)));
    return result.claim;
  }, [leagueId, accessToken]);

  const cancelClaim = useCallback(async (claimId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    await transactionApi.cancelWaiverClaim(leagueId, claimId, accessToken);
    setClaims((prev) => prev.filter((c) => c.id !== claimId));
  }, [leagueId, accessToken]);

  return {
    claims,
    playerNames,
    isLoading,
    error,
    fetchClaims,
    placeClaim,
    updateClaim,
    cancelClaim,
  };
}
