'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useMatchupDerby } from '@/features/matchups/hooks/useMatchupDerby';
import { MatchupDerbyBoard } from '@/features/matchups/components/MatchupDerbyBoard';
import { LeagueSubPageHeader } from '@/components/ui/LeagueSubPageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';

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
        <div className="mx-auto max-w-7xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 lg:grid-cols-[256px_1fr]">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <LeagueSubPageHeader leagueId={leagueId} title="Matchup Derby" />
          <div className="rounded-lg bg-card glass-strong glow-border p-4 text-destructive-foreground">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <LeagueSubPageHeader
          leagueId={leagueId}
          title="Matchup Derby"
          badge={
            !derby ? (
              <StatusBadge variant="setup">Setup</StatusBadge>
            ) : derby.status === 'active' ? (
              <StatusBadge variant="live">Live</StatusBadge>
            ) : derby.status === 'complete' ? (
              <StatusBadge variant="complete">Complete</StatusBadge>
            ) : null
          }
          actions={
            !derby && isCommissioner ? (
              <button
                onClick={async () => {
                  setIsStarting(true);
                  await handleStartDerby();
                  setIsStarting(false);
                }}
                disabled={isStarting}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                {isStarting ? 'Starting...' : 'Start Derby'}
              </button>
            ) : !derby && !isCommissioner ? (
              <span className="text-sm text-muted-foreground">
                Waiting for commissioner to start
              </span>
            ) : null
          }
        />

        {/* Pre-derby empty grid */}
        {!derby && sortedRosters.length > 0 && (
          <div className="rounded-lg bg-card glass-strong glow-border p-4 shadow">
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
          <div className="mb-6 rounded-lg bg-card glass-strong glow-border p-6 shadow text-center">
            <Trophy className="mx-auto mb-3 h-10 w-10 text-primary glow-text" />
            <h2 className="text-lg font-bold gradient-text font-heading mb-1">Derby Complete!</h2>
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
