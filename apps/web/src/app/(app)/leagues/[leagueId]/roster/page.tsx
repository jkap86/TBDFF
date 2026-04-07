'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Pencil, X, Check, Zap, Users, Heart, Truck } from 'lucide-react';
import { playerApi, leagueApi, ApiError } from '@/lib/api';
import type { Player } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useLeagueQuery, useMembersQuery, useRostersQuery } from '@/hooks/useLeagueQueries';
import { useQueryClient } from '@tanstack/react-query';
import { PlayerCard } from '@/features/roster/components/PlayerCard';
import { RosterPageSkeleton } from '@/features/roster/components/RosterPageSkeleton';
import { LeagueSubPageHeader } from '@/components/ui/LeagueSubPageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';

const STARTER_POSITIONS = new Set([
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DEF',
  'FLEX',
  'SUPER_FLEX',
  'REC_FLEX',
  'WRRB_FLEX',
]);

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

  const viewedRoster =
    rosters.find((r) => r.roster_id === selectedRosterId) ?? myRoster ?? rosters[0];

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
    playerApi
      .getByIds(allPlayerIds, accessToken)
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
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isOwnRoster = viewedRoster?.owner_id === user?.id;
  const currentWeek = (league?.settings as any)?.leg ?? 1;

  const canEditLineup =
    (league?.status === 'reg_season' || league?.status === 'post_season') && isOwnRoster;

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
    setSaveSuccess(false);
    setConfirmCancel(false);
  }

  function cancelEdit() {
    const dirty =
      viewedRoster && JSON.stringify(pendingStarters) !== JSON.stringify(viewedRoster.starters);
    if (dirty && !confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setEditMode(false);
    setSelectedPlayerId(null);
    setSaveError(null);
    setConfirmCancel(false);
  }

  function forceCancelEdit() {
    setEditMode(false);
    setSelectedPlayerId(null);
    setSaveError(null);
    setConfirmCancel(false);
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
      [newStarters[selectedInStarters], newStarters[targetInStarters]] = [
        newStarters[targetInStarters],
        newStarters[selectedInStarters],
      ];
    } else if (selectedInBench !== -1 && targetInBench !== -1) {
      // Swap two bench players
      [newBench[selectedInBench], newBench[targetInBench]] = [
        newBench[targetInBench],
        newBench[selectedInBench],
      ];
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
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditMode(false);
        setConfirmCancel(false);
      }, 1200);
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

  const isInitialLoad = playersLoading && Object.keys(playerMap).length === 0;
  const filledStarters = displayStarters.filter(Boolean).length;
  const filledBench = displayBench.filter(Boolean).length;

  const headerActions = canEditLineup ? (
    !editMode ? (
      <button
        onClick={enterEditMode}
        className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-muted-hover transition-colors"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit Lineup
      </button>
    ) : (
      <div className="flex items-center gap-2">
        <button
          onClick={cancelEdit}
          className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-muted-hover transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
        <button
          onClick={saveLineup}
          disabled={isSaving}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          <Check className="h-3.5 w-3.5" />
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    )
  ) : null;

  const headerBadge = !isOwnRoster ? (
    <StatusBadge variant="info">Viewing</StatusBadge>
  ) : editMode ? (
    <StatusBadge variant="warning">Editing</StatusBadge>
  ) : null;

  return (
    <div className="min-h-screen bg-surface p-4">
      <div className="mx-auto max-w-5xl space-y-5">
        <LeagueSubPageHeader
          leagueId={leagueId}
          title={isOwnRoster ? 'My Roster' : viewedName}
          badge={headerBadge}
          actions={headerActions}
        />

        {/* Commissioner team switcher */}
        {isCommissioner && rosters.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {rosters.map((r) => {
              const m = members.find((mem) => mem.user_id === r.owner_id);
              const label = m?.display_name || m?.username || `Team ${r.roster_id}`;
              const isActive = r.roster_id === selectedRosterId;
              const isMine = r.owner_id === user?.id;
              return (
                <button
                  key={r.roster_id}
                  onClick={() => {
                    setSelectedRosterId(r.roster_id);
                    forceCancelEdit();
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-accent-foreground hover:bg-muted-hover'
                  }`}
                >
                  {isMine ? '★ ' : ''}
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Roster context strip */}
        {viewedRoster && league && (
          <div className="rounded-lg bg-card glass-subtle px-5 py-3 flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-muted-foreground truncate">{league.name}</span>
              <span className="text-disabled">·</span>
              <span className="text-accent-foreground whitespace-nowrap">Week {currentWeek}</span>
            </div>
            <div className="flex items-center gap-3 tabular-nums">
              <span className="font-bold text-foreground whitespace-nowrap">
                {viewedRoster.settings.wins}-{viewedRoster.settings.losses}
                {viewedRoster.settings.ties > 0 ? `-${viewedRoster.settings.ties}` : ''}
              </span>
              <span className="text-disabled">·</span>
              <span className="text-neon-cyan glow-text whitespace-nowrap">
                {(viewedRoster.settings.fpts ?? 0).toFixed(1)} PF
              </span>
            </div>
          </div>
        )}

        {/* Edit-mode instruction banner */}
        {editMode && !confirmCancel && (
          <div className="rounded-lg bg-neon-cyan/5 border border-neon-cyan/30 px-4 py-3 flex items-center gap-3">
            <div className="flex-shrink-0 h-6 w-6 rounded-full bg-neon-cyan/20 flex items-center justify-center text-xs font-bold text-neon-cyan">
              {selectedPlayerId ? '2' : '1'}
            </div>
            <p className="text-sm text-foreground">
              {selectedPlayerId ? (
                <>
                  Now tap any other player to{' '}
                  <span className="text-neon-cyan font-semibold">swap positions</span>.
                </>
              ) : (
                <>Tap a player to select them for swapping.</>
              )}
            </p>
          </div>
        )}

        {/* Unsaved-changes confirm */}
        {confirmCancel && (
          <div className="rounded-lg bg-neon-rose/10 border border-neon-rose/40 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-foreground">Discard unsaved lineup changes?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmCancel(false)}
                className="rounded-md bg-muted px-3 py-1 text-xs font-medium hover:bg-muted-hover transition-colors"
              >
                Keep Editing
              </button>
              <button
                onClick={forceCancelEdit}
                className="rounded-md bg-neon-rose/20 text-neon-rose px-3 py-1 text-xs font-semibold hover:bg-neon-rose/30 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {saveSuccess && (
          <div className="rounded-lg bg-neon-cyan/15 border border-neon-cyan/40 px-4 py-2 text-sm text-neon-cyan flex items-center gap-2">
            <Check className="h-4 w-4" /> Lineup saved successfully.
          </div>
        )}
        {saveError && (
          <div className="rounded-lg bg-neon-rose/15 border border-neon-rose/40 px-4 py-2 text-sm text-neon-rose flex items-center gap-2">
            <X className="h-4 w-4" /> {saveError}
          </div>
        )}

        {isInitialLoad ? (
          <RosterPageSkeleton
            starterCount={starterSlots.length || 7}
            benchCount={benchSlotCount || 5}
            showHeader={false}
          />
        ) : (
          <>
            {/* Lineup card: Starters + Bench always side-by-side with independent scroll */}
            <div className="rounded-lg bg-card p-2.5 sm:p-4 shadow glass-strong glow-border flex flex-col max-h-[calc(100vh-280px)] min-h-[400px]">
              <div className="grid grid-cols-2 flex-1 min-h-0">
                {/* Starters column */}
                <div className="flex flex-col min-h-0 pr-2 sm:pr-4">
                  <div className="mb-2 flex items-center justify-between flex-shrink-0">
                    <h2 className="flex items-center gap-2 text-sm font-heading font-bold uppercase tracking-wide text-accent-foreground">
                      <Zap className="h-3.5 w-3.5 text-neon-cyan" />
                      Starters
                    </h2>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {filledStarters}/{starterSlots.length}
                    </span>
                  </div>
                  <div className="divide-y divide-border/50 overflow-y-auto flex-1 min-h-0 -mr-2 pr-2">
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
                          isSwappable={
                            editMode && selectedPlayerId !== null && selectedPlayerId !== playerId
                          }
                          onClick={
                            editMode && playerId
                              ? () => handlePlayerTap(playerId, 'starters')
                              : undefined
                          }
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Bench column */}
                {benchSlotCount > 0 && (
                  <div className="flex flex-col min-h-0 border-l border-border/50 pl-2 sm:pl-4">
                    <div className="mb-2 flex items-center justify-between flex-shrink-0">
                      <h2 className="flex items-center gap-2 text-sm font-heading font-bold uppercase tracking-wide text-accent-foreground">
                        <Users className="h-3.5 w-3.5 text-neon-cyan/70" />
                        Bench
                      </h2>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {filledBench}/{benchSlotCount}
                      </span>
                    </div>
                    <div className="divide-y divide-border/50 overflow-y-auto flex-1 min-h-0 -mr-2 pr-2">
                      {Array.from({ length: benchSlotCount }).map((_, idx) => {
                        const playerId = displayBench[idx] ?? '';
                        const player = playerMap[playerId] ?? null;
                        return (
                          <PlayerCard
                            key={`bench-${idx}`}
                            player={player}
                            slotLabel=""
                            editMode={editMode}
                            isSelected={editMode && selectedPlayerId === playerId}
                            isSwappable={
                              editMode && selectedPlayerId !== null && selectedPlayerId !== playerId
                            }
                            onClick={
                              editMode && playerId
                                ? () => handlePlayerTap(playerId, 'bench')
                                : undefined
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* IR */}
            {viewedRoster && viewedRoster.reserve.length > 0 && (
              <div className="rounded-lg bg-card p-6 shadow glass-subtle border-l-2 border-neon-rose/40">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-heading font-bold uppercase tracking-wide text-accent-foreground">
                  <Heart className="h-3.5 w-3.5 text-neon-rose" />
                  Injured Reserve
                </h2>
                <div className="divide-y divide-border/50">
                  {viewedRoster.reserve.map((pid, idx) => (
                    <PlayerCard key={`ir-${idx}`} player={playerMap[pid] ?? null} slotLabel="IR" />
                  ))}
                </div>
              </div>
            )}

            {/* Taxi */}
            {viewedRoster && viewedRoster.taxi.length > 0 && (
              <div className="rounded-lg bg-card p-6 shadow glass-subtle border-l-2 border-neon-purple/40">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-heading font-bold uppercase tracking-wide text-accent-foreground">
                  <Truck className="h-3.5 w-3.5 text-neon-purple" />
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
              <div className="rounded-lg bg-card glass-strong glow-border p-8 shadow text-center">
                <p className="text-muted-foreground">No players on this roster yet.</p>
                <p className="mt-1 text-sm text-muted-foreground/70">
                  Players are added after the draft.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
