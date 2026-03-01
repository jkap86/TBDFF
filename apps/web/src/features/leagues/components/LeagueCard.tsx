'use client';

import Link from 'next/link';
import type { League } from '@/lib/api';

interface LeagueCardProps {
  league: League;
}

export function LeagueCard({ league }: LeagueCardProps) {
  const statusColors: Record<string, string> = {
    pre_draft: 'bg-muted text-accent-foreground',
    drafting: 'bg-primary/10 text-primary',
    in_season: 'bg-success text-success-foreground',
    complete: 'bg-muted text-muted-foreground',
  };

  const statusLabels: Record<string, string> = {
    pre_draft: 'Pre-Draft',
    drafting: 'Drafting',
    in_season: 'In Season',
    complete: 'Complete',
  };

  return (
    <Link
      href={`/leagues/${league.id}`}
      className="block rounded-lg border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between">
        <h3 className="text-lg font-bold text-foreground">{league.name}</h3>
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[league.status] || statusColors.pre_draft}`}
        >
          {statusLabels[league.status] || league.status}
        </span>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          <span className="font-medium">Season:</span> {league.season}
        </p>
        <p>
          <span className="font-medium">Teams:</span> {league.total_rosters}
        </p>
        {league.settings?.type !== undefined && (
          <p>
            <span className="font-medium">Type:</span>{' '}
            {league.settings.type === 0 ? 'Redraft' : league.settings.type === 1 ? 'Keeper' : 'Dynasty'}
          </p>
        )}
      </div>
    </Link>
  );
}
