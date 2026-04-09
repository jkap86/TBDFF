'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Zap, Users, Heart, Truck } from 'lucide-react';
import { playerApi, leagueApi, scoringApi, ApiError } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Player } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useLeagueQuery, useMembersQuery, useRostersQuery } from '@/hooks/useLeagueQueries';
import { PlayerCard } from '@/features/roster/components/PlayerCard';
import { RosterPageSkeleton } from '@/features/roster/components/RosterPageSkeleton';
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

interface LineupViewProps {
  leagueId: string;
}

export function LineupView({ leagueId }: LineupViewProps) {
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();

  const { data: league } = useLeagueQuery(leagueId);
  const { data: members = [] } = useMembersQuery(leagueId);
  const { data: rosters = [] } = useRostersQuery(leagueId);

  const currentUserMember = members.find((m) => m.user_id === user?.id);
  const isCommissioner = currentUserMember?.role === 'commissioner';

  const myRoster = rosters.find((r) => r.owner_id === user?.id);
  const [selectedRosterId, setSelectedRosterId] = useState<number | null>(null);

  useEffect(() => {
    if (myRoster && selectedRosterId === null) {
      setSelectedRosterId(myRoster.roster_id);
    }
  }, [myRoster, selectedRosterId]);

  const viewedRoster =
    rosters.find((r) => r.roster_id === selectedRosterId) ?? myRoster ?? rosters[0];

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

  type SlotRef = { section: 'starters' | 'bench'; idx: number };
  const [selectedSlot, setSelectedSlot] = useState<SlotRef | null>(null);
  const [pendingStarters, setPendingStarters] = useState<string[]>([]);
  const [pendingBench, setPendingBench] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const isOwnRoster = viewedRoster?.owner_id === user?.id;
  const currentWeek = (league?.settings as any)?.leg ?? 1;

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
    return opponentByTeam.get(team) ?? null;
  }

  const canEditLineup =
    (league?.status === 'reg_season' || league?.status === 'post_season') && isOwnRoster;

  const starterSlots = useMemo(() => {
    if (!league) return [];
    return league.roster_positions.filter((p) => STARTER_POSITIONS.has(p));
  }, [league]);

  const benchSlotCount = useMemo(() => {
    if (!league) return 0;
    return league.roster_positions.filter((p) => p === 'BN').length;
  }, [league]);

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
    const prevStarters = pendingStarters;
    const prevBench = pendingBench;

    setPendingStarters(newStarters);
    setPendingBench(newBench);
    setSelectedSlot(null);

    if (!canEditLineup || !accessToken || !viewedRoster) return;
    if (newStarters.some((s) => !s)) return;

    try {
      setSaveStatus('saving');
      setSaveError(null);
      await leagueApi.updateLineup(
        leagueId,
        viewedRoster.roster_id,
        newStarters,
        accessToken,
      );
      queryClient.invalidateQueries({ queryKey: ['rosters', leagueId] });
      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus((s) => (s === 'saved' ? 'idle' : s));
      }, 1500);
    } catch (err) {
      setPendingStarters(prevStarters);
      setPendingBench(prevBench);
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save lineup');
      setSaveStatus('idle');
    }
  }

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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Inline header bar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-2">
        <h2 className="truncate text-sm font-heading font-bold uppercase tracking-wide text-accent-foreground">
          {isOwnRoster ? 'My Roster' : viewedName}
        </h2>
        {headerBadge}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
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
                  className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
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
          <div className="rounded-lg bg-card glass-subtle px-3 py-2 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-muted-foreground truncate">{league.name}</span>
              <span className="text-disabled">·</span>
              <span className="text-accent-foreground whitespace-nowrap">Week {currentWeek}</span>
            </div>
            <div className="flex items-center gap-2 tabular-nums">
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

        {canEditLineup && selectedSlot && (() => {
          const selVal =
            selectedSlot.section === 'starters'
              ? pendingStarters[selectedSlot.idx] ?? ''
              : pendingBench[selectedSlot.idx] ?? '';
          return (
            <div className="rounded-lg bg-neon-cyan/5 border border-neon-cyan/30 px-3 py-2 text-xs text-foreground flex items-center gap-2">
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
          <div className="rounded-lg bg-neon-rose/15 border border-neon-rose/40 px-3 py-2 text-xs text-neon-rose flex items-center gap-2">
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
            {/* Lineup card: Starters + Bench side-by-side, fills container */}
            <div className="rounded-lg bg-card p-2 shadow glass-strong glow-border flex flex-col">
              <div className="grid grid-cols-2 min-h-[400px]">
                {/* Starters column */}
                <div className="flex flex-col min-h-0 min-w-0 pr-1.5 overflow-hidden">
                  <div className="mb-2 flex items-center justify-between flex-shrink-0">
                    <h3 className="flex items-center gap-1.5 text-xs font-heading font-bold uppercase tracking-wide text-accent-foreground">
                      <Zap className="h-3 w-3 text-neon-cyan" />
                      Starters
                    </h3>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
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
                  <div className="flex flex-col min-h-0 min-w-0 border-l border-border/50 pl-1.5 overflow-hidden">
                    <div className="mb-2 flex items-center justify-between flex-shrink-0">
                      <h3 className="flex items-center gap-1.5 text-xs font-heading font-bold uppercase tracking-wide text-accent-foreground">
                        <Users className="h-3 w-3 text-neon-cyan/70" />
                        Bench
                      </h3>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {filledBench}/{benchSlotCount}
                      </span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {Array.from({
                        length: Math.max(benchSlotCount, displayBench.length),
                      }).map((_, idx) => {
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
              <div className="rounded-lg bg-card p-3 shadow glass-subtle border-l-2 border-neon-rose/40">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-heading font-bold uppercase tracking-wide text-accent-foreground">
                  <Heart className="h-3 w-3 text-neon-rose" />
                  Injured Reserve
                </h3>
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
              <div className="rounded-lg bg-card p-3 shadow glass-subtle border-l-2 border-neon-purple/40">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-heading font-bold uppercase tracking-wide text-accent-foreground">
                  <Truck className="h-3 w-3 text-neon-purple" />
                  Taxi Squad
                </h3>
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

            {viewedRoster && viewedRoster.players.length === 0 && (
              <div className="rounded-lg bg-card glass-strong glow-border p-6 shadow text-center">
                <p className="text-sm text-muted-foreground">No players on this roster yet.</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
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
