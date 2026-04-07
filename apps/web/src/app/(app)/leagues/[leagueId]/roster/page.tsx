'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, X, Check } from 'lucide-react';
import { playerApi, leagueApi, ApiError } from '@/lib/api';
import type { Player } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useLeagueQuery, useMembersQuery, useRostersQuery } from '@/hooks/useLeagueQueries';
import { useQueryClient } from '@tanstack/react-query';
import { PlayerCard } from '@/features/roster/components/PlayerCard';
import { Skeleton } from '@/components/ui/Skeleton';

const STARTER_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'FLEX', 'SUPER_FLEX', 'REC_FLEX', 'WRRB_FLEX']);

export default function RosterPage() {
  const params = useParams();
  const leagueId = params.leagueId as string;
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();

  const { data: league } = useLeagueQuery(leagueId);
  const { data: members = [] } = useMembersQuery(leagueId);
  const { data: rosters = [] } = useRostersQuery(leagueId);

  const currentUserMember = members.find((m) => m.user_id === user?.id);
  const isCommissioner = currentUserMember?.role === 'commissioner';

  // Find current user's roster_id
  const myRoster = rosters.find((r) => r.owner_id === user?.id);
  const [selectedRosterId, setSelectedRosterId] = useState<number | null>(null);

  // Default to user's own roster once loaded
  useEffect(() => {
    if (myRoster && selectedRosterId === null) {
      setSelectedRosterId(myRoster.roster_id);
    }
  }, [myRoster, selectedRosterId]);

  const viewedRoster = rosters.find((r) => r.roster_id === selectedRosterId) ?? myRoster ?? rosters[0];

  // Player data
  const [playerMap, setPlayerMap] = useState<Record<string, Player>>({});
  const [playersLoading, setPlayersLoading] = useState(false);

  const allPlayerIds = useMemo(() => {
    if (!viewedRoster) return [];
    return [...viewedRoster.players, ...viewedRoster.reserve, ...viewedRoster.taxi];
  }, [viewedRoster]);

  useEffect(() => {
    if (!accessToken || allPlayerIds.length === 0) return;
    setPlayersLoading(true);
    playerApi.getByIds(allPlayerIds, accessToken)
      .then((res) => {
        const map: Record<string, Player> = {};
        for (const p of res.players) {
          if (p) map[p.id] = p;
        }
        setPlayerMap(map);
      })
      .catch(() => {})
      .finally(() => setPlayersLoading(false));
  }, [allPlayerIds.join(','), accessToken]);

  // Edit lineup state
  const [editMode, setEditMode] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [pendingStarters, setPendingStarters] = useState<string[]>([]);
  const [pendingBench, setPendingBench] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canEditLineup =
    (league?.status === 'reg_season' || league?.status === 'post_season') &&
    viewedRoster?.owner_id === user?.id;

  // Derive starter slots and bench from roster_positions
  const starterSlots = useMemo(() => {
    if (!league) return [];
    return league.roster_positions.filter((p) => STARTER_POSITIONS.has(p));
  }, [league]);

  const benchSlotCount = useMemo(() => {
    if (!league) return 0;
    return league.roster_positions.filter((p) => p === 'BN').length;
  }, [league]);

  function enterEditMode() {
    if (!viewedRoster) return;
    setPendingStarters([...viewedRoster.starters]);
    // Bench = all players not in starters, reserve, or taxi
    const nonBench = new Set([
      ...viewedRoster.starters,
      ...viewedRoster.reserve,
      ...viewedRoster.taxi,
    ]);
    const bench = viewedRoster.players.filter((pid) => !nonBench.has(pid));
    setPendingBench(bench);
    setEditMode(true);
    setSelectedPlayerId(null);
    setSaveError(null);
  }

  function cancelEdit() {
    setEditMode(false);
    setSelectedPlayerId(null);
    setSaveError(null);
  }

  function handlePlayerTap(playerId: string, section: 'starters' | 'bench') {
    if (!editMode) return;

    if (selectedPlayerId === null) {
      setSelectedPlayerId(playerId);
      return;
    }

    if (selectedPlayerId === playerId) {
      setSelectedPlayerId(null);
      return;
    }

    // Perform swap
    const newStarters = [...pendingStarters];
    const newBench = [...pendingBench];
    const selectedInStarters = newStarters.indexOf(selectedPlayerId);
    const targetInStarters = newStarters.indexOf(playerId);
    const selectedInBench = newBench.indexOf(selectedPlayerId);
    const targetInBench = newBench.indexOf(playerId);

    if (selectedInStarters !== -1 && targetInBench !== -1) {
      // Swap starter → bench
      newStarters[selectedInStarters] = playerId;
      newBench[targetInBench] = selectedPlayerId;
    } else if (selectedInBench !== -1 && targetInStarters !== -1) {
      // Swap bench → starter
      newBench[selectedInBench] = playerId;
      newStarters[targetInStarters] = selectedPlayerId;
    } else if (selectedInStarters !== -1 && targetInStarters !== -1) {
      // Swap two starters
      [newStarters[selectedInStarters], newStarters[targetInStarters]] =
        [newStarters[targetInStarters], newStarters[selectedInStarters]];
    } else if (selectedInBench !== -1 && targetInBench !== -1) {
      // Swap two bench players
      [newBench[selectedInBench], newBench[targetInBench]] =
        [newBench[targetInBench], newBench[selectedInBench]];
    }

    setPendingStarters(newStarters);
    setPendingBench(newBench);
    setSelectedPlayerId(null);
  }

  async function saveLineup() {
    if (!accessToken || !viewedRoster) return;
    try {
      setIsSaving(true);
      setSaveError(null);
      await leagueApi.updateLineup(leagueId, viewedRoster.roster_id, pendingStarters, accessToken);
      queryClient.invalidateQueries({ queryKey: ['rosters', leagueId] });
      setEditMode(false);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save lineup');
    } finally {
      setIsSaving(false);
    }
  }

  // Display data: use pending arrays in edit mode, actual roster otherwise
  const displayStarters = editMode ? pendingStarters : (viewedRoster?.starters ?? []);
  const displayBench = useMemo(() => {
    if (!viewedRoster) return [];
    if (editMode) return pendingBench;
    const nonBench = new Set([
      ...viewedRoster.starters,
      ...viewedRoster.reserve,
      ...viewedRoster.taxi,
    ]);
    return viewedRoster.players.filter((pid) => !nonBench.has(pid));
  }, [viewedRoster, editMode, pendingBench]);

  const viewedMember = members.find((m) => m.user_id === viewedRoster?.owner_id);
  const viewedName = viewedMember?.display_name || viewedMember?.username || 'Unowned';

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/leagues/${leagueId}`}
              className="rounded p-2 text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                {viewedRoster?.owner_id === user?.id ? 'My Roster' : `${viewedName}'s Roster`}
              </h1>
              {league && (
                <p className="text-xs text-muted-foreground">
                  {league.name} · {league.season}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Commissioner team selector */}
            {isCommissioner && rosters.length > 1 && (
              <select
                value={selectedRosterId ?? ''}
                onChange={(e) => {
                  setSelectedRosterId(Number(e.target.value));
                  setEditMode(false);
                  setSelectedPlayerId(null);
                }}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
              >
                {rosters.map((r) => {
                  const m = members.find((mem) => mem.user_id === r.owner_id);
                  const label = m?.display_name || m?.username || `Team ${r.roster_id}`;
                  return (
                    <option key={r.roster_id} value={r.roster_id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            )}

            {/* Edit toggle */}
            {canEditLineup && !editMode && (
              <button
                onClick={enterEditMode}
                className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-muted-hover"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Lineup
              </button>
            )}
            {editMode && (
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-muted-hover"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
                <button
                  onClick={saveLineup}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>

        {editMode && (
          <p className="text-sm text-muted-foreground">
            Tap a player to select, then tap another to swap positions.
          </p>
        )}
        {saveError && (
          <div className="rounded bg-destructive px-4 py-2 text-sm text-destructive-foreground">
            {saveError}
          </div>
        )}

        {playersLoading && !viewedRoster ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            {/* Starters */}
            <div className="rounded-lg bg-card p-6 shadow glass-strong">
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Starters
              </h2>
              <div className="divide-y divide-border/50">
                {starterSlots.map((slot, idx) => {
                  const playerId = displayStarters[idx] ?? '';
                  const player = playerMap[playerId] ?? null;
                  return (
                    <PlayerCard
                      key={`${slot}-${idx}`}
                      player={player}
                      slotLabel={slot}
                      editMode={editMode}
                      isSelected={editMode && selectedPlayerId === playerId}
                      isSwappable={editMode && selectedPlayerId !== null && selectedPlayerId !== playerId}
                      onClick={editMode && playerId ? () => handlePlayerTap(playerId, 'starters') : undefined}
                    />
                  );
                })}
              </div>
            </div>

            {/* Bench */}
            {benchSlotCount > 0 && (
              <div className="rounded-lg bg-card p-6 shadow glass-subtle">
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Bench
                </h2>
                <div className="divide-y divide-border/50">
                  {Array.from({ length: benchSlotCount }).map((_, idx) => {
                    const playerId = displayBench[idx] ?? '';
                    const player = playerMap[playerId] ?? null;
                    return (
                      <PlayerCard
                        key={`bench-${idx}`}
                        player={player}
                        slotLabel="BN"
                        editMode={editMode}
                        isSelected={editMode && selectedPlayerId === playerId}
                        isSwappable={editMode && selectedPlayerId !== null && selectedPlayerId !== playerId}
                        onClick={editMode && playerId ? () => handlePlayerTap(playerId, 'bench') : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* IR */}
            {viewedRoster && viewedRoster.reserve.length > 0 && (
              <div className="rounded-lg bg-card p-6 shadow glass-subtle">
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Injured Reserve
                </h2>
                <div className="divide-y divide-border/50">
                  {viewedRoster.reserve.map((pid, idx) => (
                    <PlayerCard
                      key={`ir-${idx}`}
                      player={playerMap[pid] ?? null}
                      slotLabel="IR"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Taxi */}
            {viewedRoster && viewedRoster.taxi.length > 0 && (
              <div className="rounded-lg bg-card p-6 shadow glass-subtle">
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Taxi Squad
                </h2>
                <div className="divide-y divide-border/50">
                  {viewedRoster.taxi.map((pid, idx) => (
                    <PlayerCard
                      key={`taxi-${idx}`}
                      player={playerMap[pid] ?? null}
                      slotLabel="BN"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {viewedRoster && viewedRoster.players.length === 0 && (
              <div className="rounded-lg bg-card p-8 shadow text-center">
                <p className="text-muted-foreground">No players on this roster yet.</p>
                <p className="mt-1 text-sm text-disabled">Players are added after the draft.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
