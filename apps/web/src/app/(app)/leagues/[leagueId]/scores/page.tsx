'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { ChevronDown, Radio } from 'lucide-react';
import { playerApi } from '@/lib/api';
import { LeagueSubPageHeader } from '@/components/ui/LeagueSubPageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Player } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  useLeagueQuery,
  useMembersQuery,
  useRostersQuery,
  useMatchupsQuery,
  useScoresQuery,
  useLiveScoresQuery,
} from '@/hooks/useLeagueQueries';
import { BoxScore } from '@/features/scores/components/BoxScore';
import type { Roster } from '@tbdff/shared';

const STARTER_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'FLEX', 'SUPER_FLEX', 'REC_FLEX', 'WRRB_FLEX']);

export default function ScoresPage() {
  const params = useParams();
  const leagueId = params.leagueId as string;
  const { accessToken } = useAuth();

  const { data: league } = useLeagueQuery(leagueId);
  const { data: members = [] } = useMembersQuery(leagueId);
  const { data: rosters = [] } = useRostersQuery(leagueId);
  const { data: allMatchups = [] } = useMatchupsQuery(leagueId);

  // Current week from league settings, default to 1
  const currentWeek = (league?.settings as any)?.leg ?? 1;
  const weeks = useMemo(
    () => [...new Set(allMatchups.map((m) => m.week))].sort((a, b) => a - b),
    [allMatchups],
  );

  const [selectedWeek, setSelectedWeek] = useState<number>(0);
  useEffect(() => {
    if (selectedWeek === 0 && weeks.length > 0) {
      // Default to current week, or last available week
      const initial = weeks.includes(currentWeek) ? currentWeek : weeks[weeks.length - 1];
      setSelectedWeek(initial);
    }
  }, [weeks, currentWeek, selectedWeek]);

  const [expandedMatchupId, setExpandedMatchupId] = useState<number | null>(null);

  // Determine if selected week is "live" (current week)
  const isLiveWeek = selectedWeek === currentWeek;
  const playoffWeekStart = (league?.settings as any)?.playoff_week_start ?? 99;
  const isRegSeason = selectedWeek < playoffWeekStart;

  // Fetch scores
  const { data: pastScores = [] } = useScoresQuery(
    leagueId,
    isLiveWeek ? 0 : selectedWeek, // don't fetch past if live
  );
  const { data: liveData } = useLiveScoresQuery(
    leagueId,
    isLiveWeek ? selectedWeek : 0,
  );

  // Build score map: playerId → points
  const scoreMap = useMemo<Record<string, number>>(() => {
    if (isLiveWeek && liveData?.players) {
      const map: Record<string, number> = {};
      for (const p of liveData.players) map[p.player_id] = p.live_total ?? p.actual_points;
      return map;
    }
    const map: Record<string, number> = {};
    for (const s of pastScores) map[s.player_id] = s.fantasy_points;
    return map;
  }, [isLiveWeek, liveData, pastScores]);

  const projectedMap = useMemo<Record<string, number>>(() => {
    if (!isLiveWeek || !liveData?.players) return {};
    const map: Record<string, number> = {};
    for (const p of liveData.players) map[p.player_id] = p.projected_points;
    return map;
  }, [isLiveWeek, liveData]);

  // Roster score totals
  const rosterScoreMap = useMemo<Record<number, number>>(() => {
    if (isLiveWeek && liveData?.rosters) {
      const map: Record<number, number> = {};
      for (const r of liveData.rosters) map[r.roster_id] = r.live_total;
      return map;
    }
    // Calculate from matchup data points
    const map: Record<number, number> = {};
    for (const m of allMatchups) {
      if (m.week === selectedWeek) map[m.roster_id] = m.points;
    }
    return map;
  }, [isLiveWeek, liveData, allMatchups, selectedWeek]);

  // Player data
  const [playerMap, setPlayerMap] = useState<Record<string, Player>>({});
  const allPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rosters) for (const pid of r.players) ids.add(pid);
    return Array.from(ids);
  }, [rosters]);

  useEffect(() => {
    if (!accessToken || allPlayerIds.length === 0) return;
    playerApi.getByIds(allPlayerIds, accessToken).then((res) => {
      const map: Record<string, Player> = {};
      for (const p of res.players) if (p) map[p.id] = p;
      setPlayerMap(map);
    }).catch(() => {});
  }, [allPlayerIds.join(','), accessToken]);

  function getRosterLabel(rosterId: number) {
    const roster = rosters.find((r) => r.roster_id === rosterId);
    if (roster?.owner_id) {
      const member = members.find((m) => m.user_id === roster.owner_id);
      return member?.display_name || member?.username || `Team ${rosterId}`;
    }
    return `Team ${rosterId}`;
  }

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

  const starterSlots = useMemo(
    () => (league?.roster_positions ?? []).filter((p) => STARTER_POSITIONS.has(p)),
    [league],
  );

  const hasScores = Object.keys(scoreMap).length > 0;

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <LeagueSubPageHeader
          leagueId={leagueId}
          title="Scores"
          badge={
            isLiveWeek && hasScores ? (
              <StatusBadge variant="live">
                <Radio className="mr-1 h-3 w-3" />
                Live
              </StatusBadge>
            ) : null
          }
        />

        {/* Week selector */}
        {weeks.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {weeks.map((week) => (
              <button
                key={week}
                onClick={() => { setSelectedWeek(week); setExpandedMatchupId(null); }}
                className={`rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
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

        {/* Matchup cards */}
        {weekMatchups.length === 0 ? (
          <div className="rounded-lg bg-card p-8 shadow text-center">
            <p className="text-muted-foreground">
              {weeks.length === 0
                ? 'No schedule generated yet.'
                : `No matchup data available for Week ${selectedWeek} yet.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {weekMatchups.map((pair) => {
              const [a, b] = pair;
              const scoreA = rosterScoreMap[a.roster_id] ?? 0;
              const scoreB = rosterScoreMap[b.roster_id] ?? 0;
              const nameA = getRosterLabel(a.roster_id);
              const nameB = getRosterLabel(b.roster_id);
              const hasResult = scoreA > 0 || scoreB > 0;
              const winnerA = hasResult && scoreA > scoreB;
              const winnerB = hasResult && scoreB > scoreA;
              const isExpanded = expandedMatchupId === a.matchup_id;

              const rosterObjA = rosters.find((r) => r.roster_id === a.roster_id);
              const rosterObjB = rosters.find((r) => r.roster_id === b.roster_id);

              return (
                <div
                  key={a.matchup_id}
                  className={`rounded-lg bg-card shadow overflow-hidden transition-all ${
                    isExpanded ? 'glass-strong glow-border' : 'glass-subtle'
                  }`}
                >
                  <button
                    onClick={() => setExpandedMatchupId(isExpanded ? null : a.matchup_id)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left"
                  >
                    {/* Team A */}
                    <div className={`flex min-w-0 flex-1 flex-col ${winnerA ? 'border-l-[3px] border-neon-cyan bg-neon-cyan/10 pl-2 -ml-1' : ''}`}>
                      <span className={`truncate text-sm font-semibold ${winnerA ? 'text-foreground' : 'text-accent-foreground'}`}>
                        {nameA}
                      </span>
                      <span className={`text-lg font-bold tabular-nums ${winnerA ? 'text-neon-cyan glow-text' : hasResult ? 'text-foreground' : 'text-disabled'}`}>
                        {hasResult ? scoreA.toFixed(2) : '—'}
                      </span>
                    </div>

                    <span className="flex-shrink-0 text-xs font-medium text-disabled">vs</span>

                    {/* Team B */}
                    <div className={`flex min-w-0 flex-1 flex-col items-end ${winnerB ? 'border-r-[3px] border-neon-cyan bg-neon-cyan/10 pr-2 -mr-1' : ''}`}>
                      <span className={`truncate text-sm font-semibold ${winnerB ? 'text-foreground' : 'text-accent-foreground'}`}>
                        {nameB}
                      </span>
                      <span className={`text-lg font-bold tabular-nums ${winnerB ? 'text-neon-cyan glow-text' : hasResult ? 'text-foreground' : 'text-disabled'}`}>
                        {hasResult ? scoreB.toFixed(2) : '—'}
                      </span>
                    </div>

                    <ChevronDown
                      className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                    />
                  </button>

                  {/* Box score */}
                  {isExpanded && rosterObjA && rosterObjB && (
                    <div className="px-5 pb-5">
                      <BoxScore
                        rosterA={rosterObjA}
                        rosterB={rosterObjB}
                        rosterAName={nameA}
                        rosterBName={nameB}
                        playerMap={playerMap}
                        scoreMap={scoreMap}
                        projectedMap={isLiveWeek ? projectedMap : undefined}
                        isLive={isLiveWeek && hasScores}
                        starterSlots={starterSlots}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
