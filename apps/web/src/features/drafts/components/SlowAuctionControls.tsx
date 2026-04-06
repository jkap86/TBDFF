'use client';

import type { NominationStatsResponse } from '@/lib/api';

interface SlowAuctionControlsProps {
  pickError: string | null;
  nominationStats: NominationStatsResponse | null;
}

export function SlowAuctionControls({
  pickError,
  nominationStats,
}: SlowAuctionControlsProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-4">
        {/* Nomination Stats */}
        {nominationStats && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Your noms: <span className="font-medium text-accent-foreground">
                {nominationStats.active_nominations}/{nominationStats.max_per_team}
              </span>
            </span>
            <span>
              Active global: <span className="font-medium text-accent-foreground">
                {nominationStats.global_active}/{nominationStats.max_global}
              </span>
            </span>
            {nominationStats.daily_limit > 0 && (
              <span>
                Daily: <span className="font-medium text-accent-foreground">
                  {nominationStats.daily_used}/{nominationStats.daily_limit}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
      {pickError && (
        <p className="mt-2 text-sm text-destructive-foreground">{pickError}</p>
      )}
    </div>
  );
}
