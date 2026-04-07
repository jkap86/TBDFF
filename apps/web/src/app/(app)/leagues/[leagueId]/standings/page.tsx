'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useLeagueQuery, useMembersQuery, useRostersQuery } from '@/hooks/useLeagueQueries';
import { StandingsTable } from '@/features/standings/components/StandingsTable';
import { LeagueSubPageHeader } from '@/components/ui/LeagueSubPageHeader';
import { Skeleton } from '@/components/ui/Skeleton';

export default function StandingsPage() {
  const params = useParams();
  const leagueId = params.leagueId as string;
  const { user } = useAuth();

  const { data: league, isLoading: leagueLoading } = useLeagueQuery(leagueId);
  const { data: members = [] } = useMembersQuery(leagueId);
  const { data: rosters = [], isLoading: rostersLoading } = useRostersQuery(leagueId);

  const isLoading = leagueLoading || rostersLoading;

  const settings = league?.settings as any;
  const playoffCutoff: number = settings?.playoff_teams ?? 4;
  const currentWeek: number = settings?.leg ?? 1;
  const playoffWeekStart: number = settings?.playoff_week_start ?? 15;

  // Only show rostered teams (teams with an owner)
  const ownedRosters = rosters.filter((r) => r.owner_id);

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <LeagueSubPageHeader leagueId={leagueId} title="Standings" />

        {isLoading ? (
          <div className="rounded-lg bg-card glass-strong glow-border p-6 shadow">
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          </div>
        ) : ownedRosters.length === 0 ? (
          <div className="rounded-lg bg-card glass-strong glow-border p-8 shadow text-center">
            <p className="text-muted-foreground">No teams in this league yet.</p>
          </div>
        ) : (
          <div className="rounded-lg bg-card glass-strong glow-border p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-neon-orange/70" />
                  Clinched Playoffs
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                Top {playoffCutoff} make playoffs
              </span>
            </div>

            <StandingsTable
              rosters={ownedRosters}
              members={members}
              currentUserId={user?.id}
              playoffCutoff={playoffCutoff}
              currentWeek={currentWeek}
              playoffWeekStart={playoffWeekStart}
              leagueStatus={league?.status ?? 'offseason'}
            />
          </div>
        )}
      </div>
    </div>
  );
}
