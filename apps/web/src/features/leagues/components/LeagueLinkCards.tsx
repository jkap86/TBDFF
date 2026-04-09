'use client';

import Link from 'next/link';
import { ArrowLeftRight, ClipboardList, Activity } from 'lucide-react';
import type { LeagueStatus } from '@tbdff/shared';
import { useActionsPanel } from '@/features/actions/context/ActionsPanelContext';

interface LeagueLinkCardsProps {
  leagueId: string;
  leagueStatus: LeagueStatus;
}

export function LeagueLinkCards({ leagueId, leagueStatus }: LeagueLinkCardsProps) {
  const { openPanel } = useActionsPanel();

  return (
    <>
      {/* Trades Card */}
      <button
        type="button"
        onClick={() => openPanel('trades')}
        className="block w-full rounded-lg border border-border bg-card p-6 shadow hover:shadow-md transition-shadow text-left glow-border"
      >
        <div className="flex items-center gap-3 mb-2">
          <ArrowLeftRight className="h-5 w-5 text-link" />
          <h3 className="text-lg font-bold text-foreground">Trades</h3>
        </div>
        <p className="text-sm text-muted-foreground">Trade draft picks and manage trades with other teams</p>
      </button>

      {/* Waivers & Activity Cards */}
      {(leagueStatus === 'reg_season' || leagueStatus === 'post_season' || leagueStatus === 'complete') && (
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => openPanel('waivers')}
            className="rounded-lg border border-border bg-card p-6 shadow hover:shadow-md transition-shadow text-left glow-border"
          >
            <div className="flex items-center gap-3 mb-2">
              <ClipboardList className="h-5 w-5 text-info-foreground" />
              <h3 className="text-lg font-bold text-foreground font-heading">Waivers</h3>
            </div>
            <p className="text-sm text-muted-foreground">Add free agents and manage waiver claims</p>
          </button>

          <Link
            href={`/leagues/${leagueId}/transactions`}
            className="rounded-lg border border-border bg-card p-6 shadow hover:shadow-md transition-shadow text-left glow-border"
          >
            <div className="flex items-center gap-3 mb-2">
              <Activity className="h-5 w-5 text-success-foreground" />
              <h3 className="text-lg font-bold text-foreground font-heading">Activity</h3>
            </div>
            <p className="text-sm text-muted-foreground">View all trades, waivers, and roster moves</p>
          </Link>
        </div>
      )}
    </>
  );
}
