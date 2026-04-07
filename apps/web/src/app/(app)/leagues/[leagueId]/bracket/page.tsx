'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GitBranch } from 'lucide-react';
import { useLeagueQuery, useMembersQuery, useRostersQuery, useMatchupsQuery } from '@/hooks/useLeagueQueries';
import { BracketView } from '@/features/bracket/components/BracketView';
import { buildBracket } from '@/features/bracket/utils/buildBracket';

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
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href={`/leagues/${leagueId}`}
            className="rounded p-2 text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Playoff Bracket</h1>
            {league && (
              <p className="text-xs text-muted-foreground">
                {league.name} · {league.season}
              </p>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !isPlayoff ? (
          <div className="rounded-lg bg-card p-10 shadow glass-subtle text-center">
            <GitBranch className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium text-muted-foreground">
              Playoff bracket will appear when the post season begins.
            </p>
            <p className="mt-1 text-sm text-disabled">
              Playoffs start Week {playoffWeekStart}.
            </p>
          </div>
        ) : rounds.length === 0 ? (
          <div className="rounded-lg bg-card p-8 shadow text-center">
            <p className="text-muted-foreground">No playoff matchup data yet.</p>
          </div>
        ) : (
          <div className="rounded-lg bg-card p-6 shadow glass-strong">
            <BracketView rounds={rounds} getRosterLabel={getRosterLabel} />
          </div>
        )}
      </div>
    </div>
  );
}
