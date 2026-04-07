import React from 'react';
import type { Roster, LeagueMember, LeagueStatus } from '@tbdff/shared';

interface StandingsTableProps {
  rosters: Roster[];
  members: LeagueMember[];
  currentUserId: string | undefined;
  playoffCutoff: number;
  currentWeek: number;
  playoffWeekStart: number;
  leagueStatus: LeagueStatus;
}

export function StandingsTable({
  rosters,
  members,
  currentUserId,
  playoffCutoff,
  currentWeek,
  playoffWeekStart,
  leagueStatus,
}: StandingsTableProps) {
  const sorted = [...rosters].sort((a, b) => {
    if (b.settings.wins !== a.settings.wins) return b.settings.wins - a.settings.wins;
    return b.settings.fpts - a.settings.fpts;
  });

  const remainingWeeks = Math.max(0, playoffWeekStart - currentWeek - 1);
  const firstOutTeam = sorted[playoffCutoff]; // first team outside playoff

  function hasClinched(roster: Roster, rank: number): boolean {
    if (rank >= playoffCutoff) return false;
    if (!firstOutTeam) return true; // fewer teams than spots
    if (leagueStatus === 'post_season' || leagueStatus === 'complete') return true;
    const winGap = roster.settings.wins - firstOutTeam.settings.wins;
    return winGap > remainingWeeks;
  }

  function getTeamName(roster: Roster): string {
    if (!roster.owner_id) return `Team ${roster.roster_id}`;
    const member = members.find((m) => m.user_id === roster.owner_id);
    return member?.display_name || member?.username || `Team ${roster.roster_id}`;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="pb-3 pr-3 text-left w-8">#</th>
            <th className="pb-3 pr-3 text-left">Team</th>
            <th className="pb-3 px-3 text-center w-8">W</th>
            <th className="pb-3 px-3 text-center w-8">L</th>
            <th className="pb-3 px-3 text-center w-8">T</th>
            <th className="pb-3 px-3 text-right min-w-[64px]">PF</th>
            <th className="pb-3 pl-3 text-right min-w-[52px]">FAAB</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((roster, idx) => {
            const rank = idx + 1;
            const isCurrentUser = roster.owner_id === currentUserId;
            const clinched = hasClinched(roster, rank - 1);
            const name = getTeamName(roster);
            const isPlayoffCutoff = idx === playoffCutoff - 1 && playoffCutoff < sorted.length;

            return (
              <React.Fragment key={roster.id}>
                <tr className={`border-b border-border/40 transition-colors ${
                    isCurrentUser ? 'bg-neon-cyan/5 ring-1 ring-inset ring-neon-cyan/20' : 'hover:bg-muted/30'
                  }`}
                >
                  <td className="py-3 pr-3 font-bold tabular-nums text-muted-foreground">{rank}</td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate font-medium text-foreground">{name}</span>
                      {isCurrentUser && (
                        <span className="flex-shrink-0 rounded-full bg-neon-cyan/20 px-1.5 py-0.5 text-xs font-medium text-neon-cyan">
                          You
                        </span>
                      )}
                      {clinched && (
                        <span className="flex-shrink-0 rounded-full bg-neon-orange/20 px-1.5 py-0.5 text-xs font-bold text-neon-orange">
                          C
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center tabular-nums text-foreground">{roster.settings.wins}</td>
                  <td className="py-3 px-3 text-center tabular-nums text-foreground">{roster.settings.losses}</td>
                  <td className="py-3 px-3 text-center tabular-nums text-muted-foreground">{roster.settings.ties}</td>
                  <td className="py-3 px-3 text-right tabular-nums text-foreground">
                    {roster.settings.fpts?.toFixed(2) ?? '0.00'}
                  </td>
                  <td className="py-3 pl-3 text-right tabular-nums text-muted-foreground">
                    ${roster.waiver_budget}
                  </td>
                </tr>
                {isPlayoffCutoff && (
                  <tr key={`cutoff-${idx}`} className="border-t-2 border-neon-cyan/40">
                    <td colSpan={7} className="py-1 text-center text-xs text-neon-cyan/60 font-medium tracking-widest">
                      — Playoff Line —
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
