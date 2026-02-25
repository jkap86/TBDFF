'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { leagueApi, ApiError } from '@/lib/api';
import type { Roster, League } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useWaivers } from '@/features/transactions/hooks/useWaivers';
import { useTransactions } from '@/features/transactions/hooks/useTransactions';
import { WaiverClaimForm } from '@/features/transactions/components/WaiverClaimForm';
import { MyWaiverClaims } from '@/features/transactions/components/MyWaiverClaims';

export default function WaiversPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;
  const { accessToken, user } = useAuth();

  const [league, setLeague] = useState<League | null>(null);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [allPlayers, setAllPlayers] = useState<string[]>([]);
  const [claimingPlayer, setClaimingPlayer] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const { claims, isLoading: claimsLoading, fetchClaims, placeClaim, cancelClaim } = useWaivers(leagueId);
  const { addPlayer, dropPlayer } = useTransactions(leagueId);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      leagueApi.getById(leagueId, accessToken),
      leagueApi.getRosters(leagueId, accessToken),
    ]).then(([leagueResult, rostersResult]) => {
      setLeague(leagueResult.league);
      setRosters(rostersResult.rosters);

      // Collect all rostered players to identify free agents
      const rostered = new Set<string>();
      for (const r of rostersResult.rosters) {
        for (const p of r.players) rostered.add(p);
      }
      setAllPlayers(Array.from(rostered));
    }).catch(() => {});
  }, [leagueId, accessToken]);

  const myRoster = rosters.find((r) => r.owner_id === user?.id);

  const handleAddPlayer = async (playerId: string) => {
    try {
      setAddError(null);
      await addPlayer(playerId);
      // Refresh rosters
      if (accessToken) {
        const result = await leagueApi.getRosters(leagueId, accessToken);
        setRosters(result.rosters);
      }
    } catch (err: any) {
      setAddError(err.message || 'Failed to add player');
    }
  };

  const handleDropPlayer = async (playerId: string) => {
    try {
      setAddError(null);
      await dropPlayer(playerId);
      if (accessToken) {
        const result = await leagueApi.getRosters(leagueId, accessToken);
        setRosters(result.rosters);
      }
    } catch (err: any) {
      setAddError(err.message || 'Failed to drop player');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/leagues/${leagueId}`)}
            className="rounded p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Waivers & Free Agents</h1>
        </div>

        {addError && (
          <div className="rounded bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-600 dark:text-red-400">{addError}</div>
        )}

        {/* My Pending Claims */}
        <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">My Pending Claims</h2>
          <MyWaiverClaims
            claims={claims}
            isLoading={claimsLoading}
            onCancel={cancelClaim}
          />
        </div>

        {/* Claim Form (if claiming a player) */}
        {claimingPlayer && myRoster && league && (
          <WaiverClaimForm
            playerId={claimingPlayer}
            roster={myRoster}
            waiverType={league.settings.waiver_type}
            onSubmit={async (data) => {
              await placeClaim(data);
              setClaimingPlayer(null);
              fetchClaims();
            }}
            onCancel={() => setClaimingPlayer(null)}
          />
        )}

        {/* My Roster */}
        {myRoster && (
          <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">My Roster</h2>
            <div className="space-y-2">
              {myRoster.players.map((playerId) => (
                <div
                  key={playerId}
                  className="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 p-3"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{playerId}</span>
                  <button
                    onClick={() => handleDropPlayer(playerId)}
                    className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
                  >
                    Drop
                  </button>
                </div>
              ))}
              {myRoster.players.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">No players on roster</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
