'use client';

import Link from 'next/link';
import type { League } from '@/lib/api';

interface LeagueCardProps {
  league: League;
}

export function LeagueCard({ league }: LeagueCardProps) {
  const statusColors: Record<string, string> = {
    pre_draft: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    drafting: 'bg-blue-100 text-blue-700',
    in_season: 'bg-green-100 text-green-700',
    complete: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
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
      className="block rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{league.name}</h3>
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[league.status] || statusColors.pre_draft}`}
        >
          {statusLabels[league.status] || league.status}
        </span>
      </div>

      <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
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
