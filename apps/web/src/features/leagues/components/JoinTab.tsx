'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { leagueApi, ApiError } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { PublicLeague } from '@/lib/api';

export function JoinTab() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [leagues, setLeagues] = useState<PublicLeague[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const limit = 10;

  const fetchPublicLeagues = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await leagueApi.getPublicLeagues(limit, offset);
      setLeagues(result.leagues);
      setTotal(result.total);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load public leagues');
      }
    } finally {
      setIsLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    fetchPublicLeagues();
  }, [fetchPublicLeagues]);

  const handleJoin = async (leagueId: string) => {
    if (!accessToken) return;

    try {
      setJoiningId(leagueId);
      setError(null);
      await leagueApi.join(leagueId, accessToken);
      router.push(`/leagues/${leagueId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to join league');
      }
    } finally {
      setJoiningId(null);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (isLoading) {
    return (
      <div className="rounded-lg bg-card p-6 shadow">
        <p className="text-center text-muted-foreground">Loading public leagues...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded bg-destructive p-3 text-sm text-destructive-foreground">{error}</div>
      )}

      {leagues.length === 0 ? (
        <div className="rounded-lg bg-card p-8 text-center shadow">
          <p className="text-muted-foreground">No public leagues available right now.</p>
        </div>
      ) : (
        <>
          {leagues.map((league) => (
            <div
              key={league.id}
              className="flex items-center justify-between rounded-lg bg-card p-4 shadow"
            >
              <div>
                <h3 className="font-semibold text-foreground">{league.name}</h3>
                <div className="mt-1 flex gap-3 text-sm text-muted-foreground">
                  <span>{league.season}</span>
                  <span>{league.member_count}/{league.total_rosters} teams</span>
                  <span>
                    {league.settings?.type === 1
                      ? 'Keeper'
                      : league.settings?.type === 2
                        ? 'Dynasty'
                        : 'Redraft'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleJoin(league.id)}
                disabled={joiningId !== null || league.member_count >= league.total_rosters}
                className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
              >
                {joiningId === league.id
                  ? 'Joining...'
                  : league.member_count >= league.total_rosters
                    ? 'Full'
                    : 'Join'}
              </button>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="rounded px-3 py-1 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="rounded px-3 py-1 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
