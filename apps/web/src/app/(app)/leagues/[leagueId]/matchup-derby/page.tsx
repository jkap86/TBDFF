'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trophy } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useMatchupDerby } from '@/features/matchups/hooks/useMatchupDerby';
import { MatchupDerbyBoard } from '@/features/matchups/components/MatchupDerbyBoard';

export default function MatchupDerbyPage() {
  const params = useParams();
  const leagueId = params.leagueId as string;
  const { user } = useAuth();
  const [isStarting, setIsStarting] = useState(false);

  const {
    derby,
    members,
    rosters,
    isLoading,
    error,
    timeRemaining,
    isMyTurn,
    currentPickerUserId,
    isPicking,
    pickError,
    handleStartDerby,
    handleMakePick,
    handleAutoPick,
    formatTime,
  } = useMatchupDerby(leagueId);

  const currentMember = members.find((m) => m.user_id === user?.id);
  const isCommissioner = currentMember?.role === 'commissioner';

  // Pre-derby grid data from all rosters (available even when derby is null)
  const sortedRosters = useMemo(
    () => [...rosters].sort((a, b) => a.roster_id - b.roster_id),
    [rosters],
  );

  const rosterLabels = useMemo(() => {
    const labels: Record<number, string> = {};
    for (const roster of sortedRosters) {
      if (roster.owner_id) {
        const member = members.find((m) => m.user_id === roster.owner_id);
        labels[roster.roster_id] = member?.display_name || member?.username || `Team ${roster.roster_id}`;
      } else {
        labels[roster.roster_id] = `Team ${roster.roster_id}`;
      }
    }
    return labels;
  }, [sortedRosters, members]);

  const preTeamCount = sortedRosters.length;
  const preTotalWeeks = preTeamCount > 0 ? (preTeamCount % 2 === 0 ? preTeamCount - 1 : preTeamCount) : 14;

  // When derby exists, use derby data for totalWeeks
  const teamCount = derby ? derby.derby_order.length : preTeamCount;
  const matchupsPerWeek = Math.floor(teamCount / 2);
  const totalWeeks = derby
    ? matchupsPerWeek > 0 ? Math.round(derby.total_picks / matchupsPerWeek) : 14
    : preTotalWeeks;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="grid gap-4 lg:grid-cols-[256px_1fr]">
            <div className="h-96 animate-pulse rounded-lg bg-muted" />
            <div className="h-96 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface p-6">
        <div className="mx-auto max-w-7xl">
          <Link
            href={`/leagues/${leagueId}`}
            className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-accent-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to League
          </Link>
          <div className="rounded bg-destructive p-4 text-destructive-foreground">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface p-4 lg:p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/leagues/${leagueId}`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-accent-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <h1 className="text-xl font-bold text-foreground">Matchup Derby</h1>
            {!derby && (
              <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-600">
                Setup
              </span>
            )}
            {derby?.status === 'active' && (
              <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-600">
                Live
              </span>
            )}
            {derby?.status === 'complete' && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Complete
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {!derby && isCommissioner && (
              <button
                onClick={async () => {
                  setIsStarting(true);
                  await handleStartDerby();
                  setIsStarting(false);
                }}
                disabled={isStarting}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isStarting ? 'Starting...' : 'Start Derby'}
              </button>
            )}
            {!derby && !isCommissioner && (
              <span className="text-sm text-muted-foreground">
                Waiting for commissioner to start
              </span>
            )}
          </div>
        </div>

        {/* Pre-derby empty grid */}
        {!derby && sortedRosters.length > 0 && (
          <div className="rounded-lg bg-card p-4 shadow">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-b border-border">
                      Week
                    </th>
                    {sortedRosters.map((roster) => (
                      <th
                        key={roster.roster_id}
                        className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground border-b border-border whitespace-nowrap"
                      >
                        {rosterLabels[roster.roster_id]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: preTotalWeeks }, (_, i) => i + 1).map((week) => (
                    <tr key={week} className="border-b border-border/50 last:border-0">
                      <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-accent-foreground whitespace-nowrap">
                        Wk {week}
                      </td>
                      {sortedRosters.map((roster) => (
                        <td key={roster.roster_id} className="px-2 py-1.5 text-center">
                          <span className="text-xs text-muted-foreground/40">&mdash;</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Complete state */}
        {derby?.status === 'complete' && (
          <div className="mb-6 rounded-lg bg-card p-6 shadow text-center">
            <Trophy className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h2 className="text-lg font-bold text-foreground mb-1">Derby Complete!</h2>
            <p className="text-sm text-muted-foreground mb-4">
              All {derby.total_picks} matchups have been selected. The schedule is set!
            </p>
            <Link
              href={`/leagues/${leagueId}`}
              className="inline-block rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              View Schedule
            </Link>
          </div>
        )}

        {/* Active derby board */}
        {derby?.status === 'active' && (
          <MatchupDerbyBoard
            derby={derby}
            members={members}
            rosters={rosters}
            totalWeeks={totalWeeks}
            timeRemaining={timeRemaining}
            isMyTurn={isMyTurn}
            currentPickerUserId={currentPickerUserId}
            isPicking={isPicking}
            pickError={pickError}
            isCommissioner={isCommissioner}
            userId={user?.id ?? ''}
            onMakePick={handleMakePick}
            onAutoPick={handleAutoPick}
            formatTime={formatTime}
          />
        )}
      </div>
    </div>
  );
}
