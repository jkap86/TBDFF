'use client';

import type { League, LeagueMember, Roster, LeaguePayment } from '@tbdff/shared';
import { useTransactionSocket } from '@/features/transactions/hooks/useTransactionSocket';
import { LeagueMembersStrip } from '../LeagueMembersStrip';
import { LeagueDuesCard } from '../LeagueDuesCard';
import { MyMatchupCard } from './MyMatchupCard';
import { StandingsSnippetCard } from './StandingsSnippetCard';
import { RecentActivityCard } from './RecentActivityCard';

interface LeagueRegSeasonDashboardProps {
  league: League;
  leagueId: string;
  members: LeagueMember[];
  rosters: Roster[];
  payments: LeaguePayment[];
  currentUserId: string | undefined;
  isCommissioner: boolean;
  accessToken: string | null;
  onStartDM: (memberId: string) => void;
  onAssignRoster: (rosterId: number, userId: string) => Promise<void>;
}

export function LeagueRegSeasonDashboard({
  league,
  leagueId,
  members,
  rosters,
  payments,
  currentUserId,
  isCommissioner,
  accessToken,
  onStartDM,
  onAssignRoster,
}: LeagueRegSeasonDashboardProps) {
  // Keep activity widget live across the dashboard
  useTransactionSocket(leagueId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Primary column */}
      <div className="min-w-0 space-y-6">
        <MyMatchupCard
          league={league}
          leagueId={leagueId}
          members={members}
          rosters={rosters}
          currentUserId={currentUserId}
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <StandingsSnippetCard
            league={league}
            leagueId={leagueId}
            members={members}
            rosters={rosters}
            currentUserId={currentUserId}
          />

          <RecentActivityCard
            leagueId={leagueId}
            members={members}
            rosters={rosters}
          />
        </div>
      </div>

      {/* Sidebar */}
      <div className="min-w-0 space-y-6">
        <LeagueMembersStrip
          members={members}
          rosters={rosters}
          currentUserId={currentUserId}
          onStartDM={onStartDM}
        />

        <LeagueDuesCard
          league={league}
          members={members}
          rosters={rosters}
          payments={payments}
          leagueId={leagueId}
          currentUserId={currentUserId}
          isCommissioner={isCommissioner}
          accessToken={accessToken}
          onStartDM={onStartDM}
          onAssignRoster={onAssignRoster}
        />
      </div>
    </div>
  );
}
