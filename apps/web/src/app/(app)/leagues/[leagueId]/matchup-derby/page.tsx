'use client';

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

  if (!derby) {
    return (
      <div className="min-h-screen bg-surface p-6">
        <div className="mx-auto max-w-7xl">
          <Link
            href={`/leagues/${leagueId}`}
            className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-accent-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to League
          </Link>
          <div className="rounded-lg bg-card p-8 shadow text-center">
            <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-bold text-foreground mb-2">Matchup Derby</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Owners take turns choosing their opponents each week in a live draft room.
            </p>
            {isCommissioner ? (
              <button
                onClick={handleStartDerby}
                className="rounded bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
              >
                Start Matchup Derby
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Waiting for the commissioner to start the derby.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Determine total weeks from derby metadata or default
  const teamCount = derby.derby_order.length;
  const matchupsPerWeek = Math.floor(teamCount / 2);
  const totalWeeks = matchupsPerWeek > 0 ? Math.round(derby.total_picks / matchupsPerWeek) : 14;

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
            {derby.status === 'active' && (
              <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-600">
                Live
              </span>
            )}
            {derby.status === 'complete' && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Complete
              </span>
            )}
          </div>
        </div>

        {/* Complete state */}
        {derby.status === 'complete' && (
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
        {derby.status === 'active' && (
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
