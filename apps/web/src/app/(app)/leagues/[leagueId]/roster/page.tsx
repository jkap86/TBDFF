'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { X, Zap, Users, Heart, Truck } from 'lucide-react';
import { playerApi, leagueApi, scoringApi, ApiError } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
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

// Which player positions are eligible for each starter slot.
const SLOT_ELIGIBILITY: Record<string, Set<string>> = {
  QB: new Set(['QB']),
  RB: new Set(['RB']),
  WR: new Set(['WR']),
  TE: new Set(['TE']),
  K: new Set(['K']),
  DEF: new Set(['DEF']),
  FLEX: new Set(['RB', 'WR', 'TE']),
  SUPER_FLEX: new Set(['QB', 'RB', 'WR', 'TE']),
  REC_FLEX: new Set(['WR', 'TE']),
  WRRB_FLEX: new Set(['RB', 'WR']),
};

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

  // Lineup state (always-on editing, Sleeper-style)
  type SlotRef = { section: 'starters' | 'bench'; idx: number };
  const [selectedSlot, setSelectedSlot] = useState<SlotRef | null>(null);
  const [pendingStarters, setPendingStarters] = useState<string[]>([]);
  const [pendingBench, setPendingBench] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const isOwnRoster = viewedRoster?.owner_id === user?.id;
  const currentWeek = (league?.settings as any)?.leg ?? 1;

  // Schedule for the current week → map of NFL team → opponent ("@DAL"/"vsNYG"), or null for BYE
  const { data: scheduleData } = useQuery({
    queryKey: ['schedule', league?.season, currentWeek],
    queryFn: () =>
      scoringApi.getGameSchedule(league!.season, currentWeek, accessToken!, 'regular'),
    enabled: !!accessToken && !!league?.season && !!currentWeek,
    staleTime: 60_000,
  });

  const opponentByTeam = useMemo(() => {
    const map = new Map<string, string>();
    const games = scheduleData?.games ?? [];
    for (const g of games) {
      const meta: any = g.metadata || {};
      const home = meta.home_team;
      const away = meta.away_team;
      if (home && away) {
        map.set(home, `vs ${away}`);
        map.set(away, `@ ${home}`);
      }
    }
    return map;
  }, [scheduleData]);

  function getOpponent(team: string | null | undefined): string | null | undefined {
    if (!team) return undefined;
    return opponentByTeam.get(team) ?? null; // null = BYE
  }

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

  // Sync local lineup state from server when switching teams or on first load.
  // Intentionally NOT dependent on the whole viewedRoster — refetches after save
  // shouldn't clobber in-flight user edits.
  useEffect(() => {
    if (!viewedRoster) return;
    const starters = [...viewedRoster.starters];
    while (starters.length < starterSlots.length) starters.push('');
    setPendingStarters(starters);

    const nonBench = new Set([
      ...viewedRoster.starters.filter(Boolean),
      ...viewedRoster.reserve,
      ...viewedRoster.taxi,
    ]);
    const bench = viewedRoster.players.filter((pid) => !nonBench.has(pid));
    while (bench.length < benchSlotCount) bench.push('');
    setPendingBench(bench);

    setSelectedSlot(null);
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedRoster?.roster_id, starterSlots.length, benchSlotCount]);

  async function performSwap(newStarters: string[], newBench: string[]) {
    // Snapshot for rollback
    const prevStarters = pendingStarters;
    const prevBench = pendingBench;

    // Optimistic update
    setPendingStarters(newStarters);
    setPendingBench(newBench);
    setSelectedSlot(null);

    if (!canEditLineup || !accessToken || !viewedRoster) return;

    // Only persist a fully-filled lineup (backend validates length).
    if (newStarters.some((s) => !s)) return;

    try {
      setSaveStatus('saving');
      setSaveError(null);
      await leagueApi.updateLineup(
        leagueId,
        viewedRoster.roster_id,
        newStarters,
        accessToken
      );
      queryClient.invalidateQueries({ queryKey: ['rosters', leagueId] });
      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus((s) => (s === 'saved' ? 'idle' : s));
      }, 1500);
    } catch (err) {
      // Rollback
      setPendingStarters(prevStarters);
      setPendingBench(prevBench);
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save lineup');
      setSaveStatus('idle');
    }
  }

  // A player fits a slot if the slot is bench, or the player's position is
  // eligible for the starter slot label. Empty player ids always "fit" so a
  // filled slot can move into an empty target.
  function playerFitsSlot(playerId: string, section: 'starters' | 'bench', idx: number) {
    if (!playerId) return true;
    if (section === 'bench') return true;
    const slotLabel = starterSlots[idx];
    const eligible = SLOT_ELIGIBILITY[slotLabel];
    if (!eligible) return true;
    const pos = playerMap[playerId]?.position;
    return pos ? eligible.has(pos) : false;
  }

  function handleSlotTap(section: 'starters' | 'bench', idx: number) {
    if (!canEditLineup) return;

    const currentValue =
      section === 'starters' ? pendingStarters[idx] ?? '' : pendingBench[idx] ?? '';

    if (selectedSlot === null) {
      setSelectedSlot({ section, idx });
      return;
    }

    if (selectedSlot.section === section && selectedSlot.idx === idx) {
      setSelectedSlot(null);
      return;
    }

    const srcVal =
      selectedSlot.section === 'starters'
        ? pendingStarters[selectedSlot.idx] ?? ''
        : pendingBench[selectedSlot.idx] ?? '';
    const dstVal = currentValue;

    // Reject swap if either player wouldn't fit its destination slot.
    if (
      !playerFitsSlot(srcVal, section, idx) ||
      !playerFitsSlot(dstVal, selectedSlot.section, selectedSlot.idx)
    ) {
      setSaveError('Player position not eligible for that slot');
      setSelectedSlot(null);
      setTimeout(() => setSaveError(null), 2000);
      return;
    }

    const newStarters = [...pendingStarters];
    const newBench = [...pendingBench];
    if (selectedSlot.section === 'starters') newStarters[selectedSlot.idx] = dstVal;
    else newBench[selectedSlot.idx] = dstVal;
    if (section === 'starters') newStarters[idx] = srcVal;
    else newBench[idx] = srcVal;

    performSwap(newStarters, newBench);
  }

  // Display data: always the local pending arrays (source of truth).
  const displayStarters = pendingStarters;
  const displayBench = pendingBench;

  function isEligibleSwapTarget(section: 'starters' | 'bench', idx: number) {
    if (!selectedSlot) return false;
    if (selectedSlot.section === section && selectedSlot.idx === idx) return false;
    const srcVal =
      selectedSlot.section === 'starters'
        ? pendingStarters[selectedSlot.idx] ?? ''
        : pendingBench[selectedSlot.idx] ?? '';
    const dstVal = section === 'starters' ? pendingStarters[idx] ?? '' : pendingBench[idx] ?? '';
    return (
      playerFitsSlot(srcVal, section, idx) &&
      playerFitsSlot(dstVal, selectedSlot.section, selectedSlot.idx)
    );
  }

  const viewedMember = members.find((m) => m.user_id === viewedRoster?.owner_id);
  const viewedName = viewedMember?.display_name || viewedMember?.username || 'Unowned';

  const isInitialLoad = playersLoading && Object.keys(playerMap).length === 0;
  const filledStarters = displayStarters.filter(Boolean).length;
  const filledBench = displayBench.filter(Boolean).length;

  const headerBadge = !isOwnRoster ? (
    <StatusBadge variant="info">Viewing</StatusBadge>
  ) : saveStatus === 'saving' ? (
    <StatusBadge variant="live">Saving…</StatusBadge>
  ) : saveStatus === 'saved' ? (
    <StatusBadge variant="success">Saved</StatusBadge>
  ) : null;

  return (
    <div className="min-h-screen bg-surface p-4">
      <div className="mx-auto max-w-5xl space-y-5">
        <LeagueSubPageHeader
          leagueId={leagueId}
          title={isOwnRoster ? 'My Roster' : viewedName}
          badge={headerBadge}
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
                    setSelectedSlot(null);
                    setSaveError(null);
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

        {/* Thin selection hint — only while a slot is selected */}
        {canEditLineup && selectedSlot && (() => {
          const selVal =
            selectedSlot.section === 'starters'
              ? pendingStarters[selectedSlot.idx] ?? ''
              : pendingBench[selectedSlot.idx] ?? '';
          return (
            <div className="rounded-lg bg-neon-cyan/5 border border-neon-cyan/30 px-4 py-2 text-sm text-foreground flex items-center gap-2">
              <span className="flex-shrink-0 h-2 w-2 rounded-full bg-neon-cyan animate-pulse" />
              {selVal ? (
                <span>
                  Tap another slot to{' '}
                  <span className="text-neon-cyan font-semibold">move the player</span>.
                </span>
              ) : (
                <span>
                  Tap a player to{' '}
                  <span className="text-neon-cyan font-semibold">fill this slot</span>.
                </span>
              )}
            </div>
          );
        })()}

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
            <div className="rounded-lg bg-card p-2.5 sm:p-4 shadow glass-strong glow-border flex flex-col">
              <div className="grid grid-cols-2">
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
                  <div className="divide-y divide-border/50">
                    {starterSlots.map((slot, idx) => {
                      const playerId = displayStarters[idx] ?? '';
                      const player = playerMap[playerId] ?? null;
                      return (
                        <PlayerCard
                          key={`${slot}-${idx}`}
                          player={player}
                          slotLabel={slot}
                          editMode={canEditLineup}
                          isSelected={
                            canEditLineup &&
                            selectedSlot?.section === 'starters' &&
                            selectedSlot.idx === idx
                          }
                          isSwappable={canEditLineup && isEligibleSwapTarget('starters', idx)}
                          onClick={
                            canEditLineup ? () => handleSlotTap('starters', idx) : undefined
                          }
                          opponent={getOpponent(player?.team)}
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
                    <div className="divide-y divide-border/50">
                      {Array.from({ length: benchSlotCount }).map((_, idx) => {
                        const playerId = displayBench[idx] ?? '';
                        const player = playerMap[playerId] ?? null;
                        return (
                          <PlayerCard
                            key={`bench-${idx}`}
                            player={player}
                            slotLabel=""
                            editMode={canEditLineup}
                            isSelected={
                              canEditLineup &&
                              selectedSlot?.section === 'bench' &&
                              selectedSlot.idx === idx
                            }
                            isSwappable={canEditLineup && isEligibleSwapTarget('bench', idx)}
                            onClick={
                              canEditLineup ? () => handleSlotTap('bench', idx) : undefined
                            }
                            opponent={getOpponent(player?.team)}
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
                  {viewedRoster.reserve.map((pid, idx) => {
                    const p = playerMap[pid] ?? null;
                    return (
                      <PlayerCard
                        key={`ir-${idx}`}
                        player={p}
                        slotLabel="IR"
                        opponent={getOpponent(p?.team)}
                      />
                    );
                  })}
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
                  {viewedRoster.taxi.map((pid, idx) => {
                    const p = playerMap[pid] ?? null;
                    return (
                      <PlayerCard
                        key={`taxi-${idx}`}
                        player={p}
                        slotLabel="BN"
                        opponent={getOpponent(p?.team)}
                      />
                    );
                  })}
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
