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
    <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
      <div className="flex flex-wrap items-center gap-4">
        {/* Nomination Stats */}
        {nominationStats && (
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>
              Your noms: <span className="font-medium text-gray-700 dark:text-gray-300">
                {nominationStats.active_nominations}/{nominationStats.max_per_team}
              </span>
            </span>
            <span>
              Active global: <span className="font-medium text-gray-700 dark:text-gray-300">
                {nominationStats.global_active}/{nominationStats.max_global}
              </span>
            </span>
            {nominationStats.daily_limit > 0 && (
              <span>
                Daily: <span className="font-medium text-gray-700 dark:text-gray-300">
                  {nominationStats.daily_used}/{nominationStats.daily_limit}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
      {pickError && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{pickError}</p>
      )}
    </div>
  );
}
