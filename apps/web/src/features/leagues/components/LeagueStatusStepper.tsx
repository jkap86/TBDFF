'use client';

import { statusLabels } from '@/features/leagues/config/league-detail-constants';

const ORDERED_STATUSES = ['not_filled', 'offseason', 'reg_season', 'post_season', 'complete'] as const;

interface LeagueStatusStepperProps {
  currentStatus: string;
}

export function LeagueStatusStepper({ currentStatus }: LeagueStatusStepperProps) {
  const currentIndex = ORDERED_STATUSES.indexOf(currentStatus as (typeof ORDERED_STATUSES)[number]);

  return (
    <div className="flex items-center gap-0 overflow-x-auto">
      {ORDERED_STATUSES.map((status, i) => {
        const isActive = i === currentIndex;
        const isPast = i < currentIndex;

        return (
          <div key={status} className="flex items-center">
            <span
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : isPast
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-transparent text-muted-foreground/40'
              }`}
            >
              {statusLabels[status] || status}
            </span>
            {i < ORDERED_STATUSES.length - 1 && (
              <div
                className={`mx-1 h-px w-4 ${
                  i < currentIndex ? 'bg-muted-foreground/40' : 'bg-muted-foreground/15'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
