'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { GitBranch } from 'lucide-react';
import { useLeagueQuery, useMembersQuery, useRostersQuery, useMatchupsQuery } from '@/hooks/useLeagueQueries';
import { BracketView } from '@/features/bracket/components/BracketView';
import { buildBracket } from '@/features/bracket/utils/buildBracket';
import { LeagueSubPageHeader } from '@/components/ui/LeagueSubPageHeader';
import { Skeleton } from '@/components/ui/Skeleton';

export default function BracketPage() {
  const params = useParams();
  const leagueId = params.leagueId as string;

  const { data: league, isLoading: leagueLoading } = useLeagueQuery(leagueId);
  const { data: members = [] } = useMembersQuery(leagueId);
  const { data: rosters = [] } = useRostersQuery(leagueId);
  const { data: allMatchups = [], isLoading: matchupsLoading } = useMatchupsQuery(leagueId);

  const isLoading = leagueLoading || matchupsLoading;

  const settings = league?.settings as any;
  const playoffWeekStart: number = settings?.playoff_week_start ?? 15;

  const isPlayoff =
    league?.status === 'post_season' || league?.status === 'complete';

  function getRosterLabel(rosterId: number): string {
    const roster = rosters.find((r) => r.roster_id === rosterId);
    if (roster?.owner_id) {
      const member = members.find((m) => m.user_id === roster.owner_id);
      return member?.display_name || member?.username || `Team ${rosterId}`;
    }
    return `Team ${rosterId}`;
  }

  const rounds = useMemo(
    () => (isPlayoff ? buildBracket(allMatchups, playoffWeekStart) : []),
    [allMatchups, playoffWeekStart, isPlayoff],
  );

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <LeagueSubPageHeader
          leagueId={leagueId}
          title="Playoff Bracket"
        />

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64" />
          </div>
        ) : !isPlayoff ? (
          <div className="rounded-lg bg-card glass-subtle border border-border p-10 shadow text-center">
            <GitBranch className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium text-muted-foreground">
              Playoff bracket will appear when the post season begins.
            </p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Playoffs start Week {playoffWeekStart}.
            </p>
          </div>
        ) : rounds.length === 0 ? (
          <div className="rounded-lg bg-card glass-subtle border border-border p-8 shadow text-center">
            <p className="text-muted-foreground">No playoff matchup data yet.</p>
          </div>
        ) : (
          <div className="rounded-lg bg-card glass-strong glow-border p-6 shadow">
            <BracketView rounds={rounds} getRosterLabel={getRosterLabel} />
          </div>
        )}
      </div>
    </div>
  );
}
