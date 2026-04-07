'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { matchupApi, playerApi, type DraftPick, type Player, type Roster, type LeagueMember } from '@/lib/api';

interface ScheduleTabProps {
  leagueId: string;
  myRosterId: number | undefined;
  picks: DraftPick[];
  rosters: Roster[];
  members: LeagueMember[];
  accessToken: string;
}

function PlayerRow({ player, week }: { player: Player; week: number }) {
  const onBye = player.bye_week === week;
  return (
    <div className={`flex items-center gap-1.5 text-xs ${onBye ? 'text-destructive-foreground' : 'text-success-foreground'}`}>
      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${onBye ? 'bg-destructive-foreground' : 'bg-success-foreground'}`} />
      <span className="truncate">{player.full_name}</span>
      <span className="shrink-0 opacity-60">{player.position ?? '?'}</span>
    </div>
  );
}

export function ScheduleTab({
  leagueId,
  myRosterId,
  picks,
  rosters,
  members,
  accessToken,
}: ScheduleTabProps) {
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());

  const { data: matchupData, isLoading: matchupsLoading } = useQuery({
    queryKey: ['matchups', leagueId],
    queryFn: () => matchupApi.getAll(leagueId, accessToken),
    enabled: !!accessToken,
  });

  // Fetch all drafted players across all teams so we can show opponent rosters too
  const allDraftedPlayerIds = [...new Set(picks.filter((p) => p.player_id).map((p) => p.player_id!))];

  const { data: playerData } = useQuery({
    queryKey: ['draft-all-players', allDraftedPlayerIds.join(',')],
    queryFn: () => playerApi.getByIds(allDraftedPlayerIds, accessToken),
    enabled: allDraftedPlayerIds.length > 0 && !!accessToken,
  });

  const playerMap = new Map((playerData?.players ?? []).map((p) => [p.id, p]));

  // Build rosterId -> Player[] map from live picks
  const rosterPlayerMap = new Map<number, Player[]>();
  for (const pick of picks) {
    if (!pick.player_id) continue;
    const player = playerMap.get(pick.player_id);
    if (!player) continue;
    if (!rosterPlayerMap.has(pick.roster_id)) rosterPlayerMap.set(pick.roster_id, []);
    rosterPlayerMap.get(pick.roster_id)!.push(player);
  }

  const matchups = matchupData?.matchups ?? [];

  const toggleWeek = (week: number) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(week)) next.delete(week);
      else next.add(week);
      return next;
    });
  };

  if (matchupsLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Loading schedule...
      </div>
    );
  }

  const myMatchups = matchups.filter((m) => m.roster_id === myRosterId);
  const hasMatchups = myMatchups.length > 0;

  // When matchups haven't been generated, fall back to showing all 18 NFL weeks
  const weeks = hasMatchups
    ? myMatchups.map((m) => m.week)
    : Array.from({ length: 18 }, (_, i) => i + 1);

  const weeklySchedule = weeks
    .map((week) => {
      const matchup = myMatchups.find((m) => m.week === week);
      const isBye = matchup ? matchup.matchup_id === 0 : false;
      let opponentName: string | undefined;
      let opponentRosterId: number | undefined;

      if (matchup && !isBye) {
        const opponentRecord = matchups.find(
          (x) => x.week === week && x.matchup_id === matchup.matchup_id && x.roster_id !== myRosterId
        );
        if (opponentRecord) {
          opponentRosterId = opponentRecord.roster_id;
          const opponentRoster = rosters.find((r) => r.roster_id === opponentRecord.roster_id);
          const opponentMember = members.find((mem) => mem.user_id === opponentRoster?.owner_id);
          opponentName = opponentMember?.display_name ?? opponentMember?.username ?? 'Unknown';
        }
      }

      const myPlayers = myRosterId ? (rosterPlayerMap.get(myRosterId) ?? []) : [];
      const opponentPlayers = opponentRosterId ? (rosterPlayerMap.get(opponentRosterId) ?? []) : [];

      return { week, isBye, opponentName, myPlayers, opponentPlayers };
    })
    .sort((a, b) => a.week - b.week);

  return (
    <div className="flex flex-col divide-y divide-border overflow-y-auto h-full scrollbar-sleek">
      {weeklySchedule.map(({ week, isBye, opponentName, myPlayers, opponentPlayers }) => {
        const isExpanded = expandedWeeks.has(week);
        const hasPlayers = myPlayers.length > 0 || opponentPlayers.length > 0;

        return (
          <div key={week}>
            <button
              onClick={() => hasPlayers && toggleWeek(week)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors ${
                hasPlayers ? 'hover:bg-muted/50 cursor-pointer' : 'cursor-default'
              }`}
            >
              <div className="flex items-center gap-1.5 shrink-0">
                {hasPlayers ? (
                  isExpanded
                    ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <span className="w-3" />
                )}
                <span className="text-xs font-heading font-bold text-muted-foreground uppercase tracking-wide">
                  Wk {week}
                </span>
              </div>
              {isBye ? (
                <span className="text-xs font-medium text-warning-foreground">BYE WEEK</span>
              ) : opponentName ? (
                <span className="text-sm font-medium text-foreground truncate ml-2">
                  vs {opponentName}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/50 ml-2">TBD</span>
              )}
            </button>

            {isExpanded && hasPlayers && (
              <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">My roster</p>
                  <div className="flex flex-col gap-1">
                    {myPlayers.map((p) => <PlayerRow key={p.id} player={p} week={week} />)}
                  </div>
                </div>
                {opponentPlayers.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{opponentName}&apos;s roster</p>
                    <div className="flex flex-col gap-1">
                      {opponentPlayers.map((p) => <PlayerRow key={p.id} player={p} week={week} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
