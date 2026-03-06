'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';
import { playerApi } from '@/lib/api';
import type { Player } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useWaivers } from '@/features/transactions/hooks/useWaivers';
import { useTransactions } from '@/features/transactions/hooks/useTransactions';
import { useTransactionSocket } from '@/features/transactions/hooks/useTransactionSocket';
import { useLeagueQuery, useRostersQuery } from '@/hooks/useLeagueQueries';
import { WaiverClaimForm } from '@/features/transactions/components/WaiverClaimForm';
import { MyWaiverClaims } from '@/features/transactions/components/MyWaiverClaims';

export default function WaiversPage() {
  const params = useParams();
  const leagueId = params.leagueId as string;
  const { accessToken, user } = useAuth();

  const [rosterPlayerNames, setRosterPlayerNames] = useState<Record<string, string>>({});
  const [claimingPlayer, setClaimingPlayer] = useState<string | null>(null);
  const [claimingPlayerName, setClaimingPlayerName] = useState<string | undefined>(undefined);
  const [addError, setAddError] = useState<string | null>(null);

  // Player search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: league } = useLeagueQuery(leagueId);
  const { data: rosters = [] } = useRostersQuery(leagueId);

  const { claims, playerNames: claimPlayerNames, isLoading: claimsLoading, fetchClaims, placeClaim, cancelClaim } = useWaivers(leagueId);
  const { addPlayer, dropPlayer } = useTransactions(leagueId);
  useTransactionSocket(leagueId);

  // Collect all rostered player IDs
  const allPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rosters) {
      for (const p of r.players) ids.add(p);
    }
    return Array.from(ids);
  }, [rosters]);

  const rosteredSet = useMemo(() => new Set(allPlayerIds), [allPlayerIds]);

  // Fetch player names for roster display
  useEffect(() => {
    if (!accessToken || allPlayerIds.length === 0) return;
    playerApi.getByIds(allPlayerIds, accessToken).then((res) => {
      const names: Record<string, string> = {};
      for (const p of res.players) {
        if (p) names[p.id] = p.full_name;
      }
      setRosterPlayerNames(names);
    }).catch(() => {});
  }, [allPlayerIds, accessToken]);

  // Debounced player search
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!query.trim() || !accessToken) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await playerApi.search(query, accessToken, 10);
        // Filter out already-rostered players
        setSearchResults(res.players.filter((p) => !rosteredSet.has(p.id)));
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [accessToken, rosteredSet]);

  const handleSelectPlayer = (player: Player) => {
    setClaimingPlayer(player.id);
    setClaimingPlayerName(player.full_name);
    setSearchQuery('');
    setSearchResults([]);
  };

  const myRoster = rosters.find((r) => r.owner_id === user?.id);

  const handleAddPlayer = async (playerId: string) => {
    try {
      setAddError(null);
      await addPlayer(playerId);
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to add player');
    }
  };

  const handleDropPlayer = async (playerId: string) => {
    try {
      setAddError(null);
      await dropPlayer(playerId);
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to drop player');
    }
  };

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href={`/leagues/${leagueId}`}
            className="rounded p-2 text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Waivers & Free Agents</h1>
        </div>

        {addError && (
          <div className="rounded bg-destructive p-3 text-sm text-destructive-foreground">{addError}</div>
        )}

        {/* My Pending Claims */}
        <div className="rounded-lg bg-card p-6 shadow">
          <h2 className="text-lg font-bold text-foreground mb-4">My Pending Claims</h2>
          <MyWaiverClaims
            claims={claims}
            playerNames={{ ...rosterPlayerNames, ...claimPlayerNames }}
            isLoading={claimsLoading}
            onCancel={cancelClaim}
          />
        </div>

        {/* Player Search / Claim Entry */}
        {!claimingPlayer && myRoster && (
          <div className="rounded-lg bg-card p-6 shadow">
            <h2 className="text-lg font-bold text-foreground mb-4">Place a Waiver Claim</h2>
            <div className="relative">
              <div className="flex items-center gap-2 rounded border border-input bg-surface px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search for a player to claim..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
              {(searchResults.length > 0 || isSearching) && searchQuery.trim() && (
                <div className="absolute z-10 mt-1 w-full rounded border border-border bg-card shadow-lg max-h-64 overflow-y-auto">
                  {isSearching ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Searching...</p>
                  ) : searchResults.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No available players found</p>
                  ) : (
                    searchResults.map((player) => (
                      <button
                        key={player.id}
                        onClick={() => handleSelectPlayer(player)}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-muted"
                      >
                        <span className="font-medium">{player.full_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {player.position} - {player.team ?? 'FA'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Claim Form (if claiming a player) */}
        {claimingPlayer && myRoster && league && (
          <WaiverClaimForm
            playerId={claimingPlayer}
            playerName={claimingPlayerName || rosterPlayerNames[claimingPlayer] || claimPlayerNames[claimingPlayer]}
            roster={myRoster}
            playerNames={rosterPlayerNames}
            waiverType={league.settings.waiver_type}
            onSubmit={async (data) => {
              await placeClaim(data);
              setClaimingPlayer(null);
              setClaimingPlayerName(undefined);
              fetchClaims();
            }}
            onCancel={() => {
              setClaimingPlayer(null);
              setClaimingPlayerName(undefined);
            }}
          />
        )}

        {/* My Roster */}
        {myRoster && (
          <div className="rounded-lg bg-card p-6 shadow">
            <h2 className="text-lg font-bold text-foreground mb-4">My Roster</h2>
            <div className="space-y-2">
              {myRoster.players.map((playerId) => (
                <div
                  key={playerId}
                  className="flex items-center justify-between rounded border border-border p-3"
                >
                  <span className="text-sm font-medium text-foreground">{rosterPlayerNames[playerId] || playerId}</span>
                  <button
                    onClick={() => handleDropPlayer(playerId)}
                    className="rounded bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/80"
                  >
                    Drop
                  </button>
                </div>
              ))}
              {myRoster.players.length === 0 && (
                <p className="text-sm text-muted-foreground">No players on roster</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
