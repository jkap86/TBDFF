'use client';

import type { NominationStatsResponse } from '@/lib/api';

interface SlowAuctionControlsProps {
  nominatePlayerId: string;
  setNominatePlayerId: (v: string) => void;
  isNominating: boolean;
  pickError: string | null;
  nominationStats: NominationStatsResponse | null;
  onNominate: () => void;
  canNominate: boolean;
}

export function SlowAuctionControls({
  nominatePlayerId,
  setNominatePlayerId,
  isNominating,
  pickError,
  nominationStats,
  onNominate,
  canNominate,
}: SlowAuctionControlsProps) {
  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
      <div className="flex flex-wrap items-center gap-4">
        {/* Nominate */}
        {canNominate && (
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={nominatePlayerId}
              onChange={(e) => setNominatePlayerId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && nominatePlayerId.trim()) onNominate(); }}
              placeholder="Player ID to nominate"
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={onNominate}
              disabled={isNominating || !nominatePlayerId.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isNominating ? 'Nominating...' : 'Nominate'}
            </button>
          </div>
        )}

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
