'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import { Radio, ArrowRight } from 'lucide-react';
import type { League, LeagueMember, Roster } from '@tbdff/shared';
import { useMatchupsQuery, useLiveScoresQuery } from '@/hooks/useLeagueQueries';

interface MyMatchupCardProps {
  league: League;
  leagueId: string;
  members: LeagueMember[];
  rosters: Roster[];
  currentUserId: string | undefined;
}

export function MyMatchupCard({
  league,
  leagueId,
  members,
  rosters,
  currentUserId,
}: MyMatchupCardProps) {
  const currentWeek = (league.settings as any)?.leg ?? 1;

  const { data: allMatchups = [] } = useMatchupsQuery(leagueId);

  const weeks = useMemo(
    () => [...new Set(allMatchups.map((m) => m.week))].sort((a, b) => a - b),
    [allMatchups],
  );

  const [selectedWeek, setSelectedWeek] = useState<number>(0);
  useEffect(() => {
    if (selectedWeek === 0 && weeks.length > 0) {
      const initial = weeks.includes(currentWeek) ? currentWeek : weeks[weeks.length - 1];
      setSelectedWeek(initial);
    }
  }, [weeks, currentWeek, selectedWeek]);

  const isLiveWeek = selectedWeek === currentWeek;
  const { data: liveData } = useLiveScoresQuery(leagueId, isLiveWeek ? selectedWeek : 0);

  const myRoster = rosters.find((r) => r.owner_id === currentUserId);
  const myRosterId = myRoster?.roster_id;

  function getRosterLabel(rosterId: number) {
    const roster = rosters.find((r) => r.roster_id === rosterId);
    if (roster?.owner_id) {
      const member = members.find((m) => m.user_id === roster.owner_id);
      return member?.display_name || member?.username || `Team ${rosterId}`;
    }
    return `Team ${rosterId}`;
  }

  const liveRosterById = useMemo(() => {
    const map: Record<number, { live_total: number; projected_total: number }> = {};
    for (const r of liveData?.rosters ?? []) {
      map[r.roster_id] = { live_total: r.live_total, projected_total: r.projected_total };
    }
    return map;
  }, [liveData]);

  // Build matchup pairs for selected week
  const weekMatchups = useMemo(() => {
    const weekData = allMatchups.filter((m) => m.week === selectedWeek && m.matchup_id > 0);
    const grouped: Record<number, typeof weekData> = {};
    for (const m of weekData) {
      if (!grouped[m.matchup_id]) grouped[m.matchup_id] = [];
      grouped[m.matchup_id].push(m);
    }
    return Object.values(grouped).filter((pair) => pair.length === 2);
  }, [allMatchups, selectedWeek]);

  // Sort: user's matchup first, then by matchup_id
  const sortedMatchups = useMemo(() => {
    return [...weekMatchups].sort((aPair, bPair) => {
      const aIsMine = aPair.some((m) => m.roster_id === myRosterId) ? 0 : 1;
      const bIsMine = bPair.some((m) => m.roster_id === myRosterId) ? 0 : 1;
      if (aIsMine !== bIsMine) return aIsMine - bIsMine;
      return aPair[0].matchup_id - bPair[0].matchup_id;
    });
  }, [weekMatchups, myRosterId]);

  const hasLive = isLiveWeek && !!liveData?.rosters?.length;

  return (
    <div className="rounded-lg bg-card glass-strong glow-border p-6 shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-heading font-bold uppercase tracking-wide text-accent-foreground">
          Matchups
        </h3>
        {hasLive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-neon-rose/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-neon-rose">
            <Radio className="h-3 w-3" />
            Live
          </span>
        )}
      </div>

      {/* Week selector */}
      {weeks.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {weeks.map((week) => (
            <button
              key={week}
              type="button"
              onClick={() => setSelectedWeek(week)}
              className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                selectedWeek === week
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-accent-foreground hover:bg-muted-hover'
              }`}
            >
              Wk {week}
            </button>
          ))}
        </div>
      )}

      {sortedMatchups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {weeks.length === 0
            ? 'No schedule generated yet.'
            : `No matchup data available for Week ${selectedWeek} yet.`}
        </p>
      ) : (
        <div className="space-y-2">
          {sortedMatchups.map((pair) => {
            const [a, b] = pair;
            const isMine = a.roster_id === myRosterId || b.roster_id === myRosterId;

            const liveA = liveRosterById[a.roster_id];
            const liveB = liveRosterById[b.roster_id];

            const scoreA = liveA?.live_total ?? a.points ?? 0;
            const scoreB = liveB?.live_total ?? b.points ?? 0;
            const hasResult = scoreA > 0 || scoreB > 0;
            const winnerA = hasResult && scoreA > scoreB;
            const winnerB = hasResult && scoreB > scoreA;

            const nameA = getRosterLabel(a.roster_id);
            const nameB = getRosterLabel(b.roster_id);

            const aIsCurrentUser = a.roster_id === myRosterId;
            const bIsCurrentUser = b.roster_id === myRosterId;

            return (
              <div
                key={a.matchup_id}
                className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                  isMine
                    ? 'border-neon-cyan/50 bg-neon-cyan/5'
                    : 'border-border/40 bg-background/20'
                }`}
              >
                <span
                  className={`min-w-0 flex-1 truncate text-sm font-medium ${
                    aIsCurrentUser
                      ? 'text-neon-cyan'
                      : winnerA
                        ? 'text-foreground'
                        : 'text-accent-foreground'
                  }`}
                >
                  {nameA}
                </span>
                <span
                  className={`flex-shrink-0 text-base font-bold tabular-nums ${
                    winnerA
                      ? 'text-neon-cyan glow-text'
                      : hasResult
                        ? 'text-foreground'
                        : 'text-disabled'
                  }`}
                >
                  {hasResult ? scoreA.toFixed(2) : '—'}
                </span>

                <span className="flex-shrink-0 text-xs text-disabled">vs</span>

                <span
                  className={`flex-shrink-0 text-base font-bold tabular-nums ${
                    winnerB
                      ? 'text-neon-cyan glow-text'
                      : hasResult
                        ? 'text-foreground'
                        : 'text-disabled'
                  }`}
                >
                  {hasResult ? scoreB.toFixed(2) : '—'}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-right text-sm font-medium ${
                    bIsCurrentUser
                      ? 'text-neon-cyan'
                      : winnerB
                        ? 'text-foreground'
                        : 'text-accent-foreground'
                  }`}
                >
                  {nameB}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Link
        href={`/leagues/${leagueId}/scores`}
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"
      >
        View full box scores
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
