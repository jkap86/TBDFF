'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { transactionApi } from '@/lib/api';
import type { PlaceWaiverClaimRequest } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function useWaivers(leagueId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ['waiverClaims', leagueId],
    queryFn: () => transactionApi.getWaiverClaims(leagueId, accessToken!),
    enabled: !!accessToken,
  });

  const fetchClaims = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['waiverClaims', leagueId] });
  }, [leagueId, queryClient]);

  const placeClaim = useCallback(async (claimData: PlaceWaiverClaimRequest) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await transactionApi.placeWaiverClaim(leagueId, claimData, accessToken);
    queryClient.invalidateQueries({ queryKey: ['waiverClaims', leagueId] });
    return result.claim;
  }, [leagueId, accessToken, queryClient]);

  const updateClaim = useCallback(async (claimId: string, updates: { drop_player_id?: string | null; faab_amount?: number }) => {
    if (!accessToken) throw new Error('Not authenticated');
    const result = await transactionApi.updateWaiverClaim(leagueId, claimId, updates, accessToken);
    queryClient.invalidateQueries({ queryKey: ['waiverClaims', leagueId] });
    return result.claim;
  }, [leagueId, accessToken, queryClient]);

  const cancelClaim = useCallback(async (claimId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    await transactionApi.cancelWaiverClaim(leagueId, claimId, accessToken);
    queryClient.invalidateQueries({ queryKey: ['waiverClaims', leagueId] });
  }, [leagueId, accessToken, queryClient]);

  return {
    claims: data?.claims ?? [],
    playerNames: data?.player_names ?? {},
    isLoading,
    error: queryError ? (queryError as Error).message : null,
    fetchClaims,
    placeClaim,
    updateClaim,
    cancelClaim,
  };
}
