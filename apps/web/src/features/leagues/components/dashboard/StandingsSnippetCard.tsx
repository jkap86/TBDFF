'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { League, LeagueMember, Roster } from '@tbdff/shared';

interface StandingsSnippetCardProps {
  league: League;
  leagueId: string;
  members: LeagueMember[];
  rosters: Roster[];
  currentUserId: string | undefined;
}

export function StandingsSnippetCard({
  league,
  leagueId,
  members,
  rosters,
  currentUserId,
}: StandingsSnippetCardProps) {
  const playoffCutoff = (league.settings as any)?.playoff_teams ?? 0;

  const sorted = useMemo(() => {
    return [...rosters].sort((a, b) => {
      if (b.settings.wins !== a.settings.wins) return b.settings.wins - a.settings.wins;
      return b.settings.fpts - a.settings.fpts;
    });
  }, [rosters]);

  function getTeamName(roster: Roster): string {
    if (!roster.owner_id) return `Team ${roster.roster_id}`;
    const member = members.find((m) => m.user_id === roster.owner_id);
    return member?.display_name || member?.username || `Team ${roster.roster_id}`;
  }

  return (
    <div className="rounded-lg bg-card glass-strong glow-border p-6 shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-heading font-bold uppercase tracking-wide text-accent-foreground">
          Standings
        </h3>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rosters yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-2 text-left w-6">#</th>
                <th className="pb-2 pr-2 text-left">Team</th>
                <th className="pb-2 px-1 text-center w-7">W</th>
                <th className="pb-2 px-1 text-center w-7">L</th>
                <th className="pb-2 px-1 text-center w-7">T</th>
                <th className="pb-2 pl-2 text-right min-w-[56px]">PF</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((roster, idx) => {
                const rank = idx + 1;
                const isCurrentUser = roster.owner_id === currentUserId;
                const name = getTeamName(roster);
                const isPlayoffCutoff =
                  playoffCutoff > 0 &&
                  idx === playoffCutoff - 1 &&
                  playoffCutoff < sorted.length;

                return (
                  <React.Fragment key={roster.id}>
                    <tr
                      className={`border-b border-border/40 transition-colors ${
                        isCurrentUser
                          ? 'bg-neon-cyan/10 ring-1 ring-inset ring-neon-cyan/40'
                          : 'hover:bg-muted/30'
                      }`}
                    >
                      <td
                        className={`py-2 pr-2 font-bold tabular-nums ${
                          isCurrentUser ? 'text-neon-cyan glow-text' : 'text-muted-foreground'
                        }`}
                      >
                        {rank}
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`truncate font-medium ${
                              isCurrentUser ? 'text-foreground glow-text' : 'text-foreground'
                            }`}
                          >
                            {name}
                          </span>
                          {isCurrentUser && (
                            <span className="flex-shrink-0 rounded-full bg-neon-cyan/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neon-cyan">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-1 text-center tabular-nums text-foreground">
                        {roster.settings.wins}
                      </td>
                      <td className="py-2 px-1 text-center tabular-nums text-foreground">
                        {roster.settings.losses}
                      </td>
                      <td className="py-2 px-1 text-center tabular-nums text-muted-foreground">
                        {roster.settings.ties}
                      </td>
                      <td className="py-2 pl-2 text-right tabular-nums text-foreground">
                        {roster.settings.fpts?.toFixed(2) ?? '0.00'}
                      </td>
                    </tr>
                    {isPlayoffCutoff && (
                      <tr className="border-t-2 border-neon-cyan/40">
                        <td
                          colSpan={6}
                          className="py-1 text-center text-[10px] text-neon-cyan/60 font-medium tracking-widest"
                        >
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
      )}

      <Link
        href={`/leagues/${leagueId}/standings`}
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"
      >
        Full standings
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
