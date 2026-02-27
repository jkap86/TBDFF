'use client';

import type { WaiverClaim } from '@/lib/api';
import { X } from 'lucide-react';

interface MyWaiverClaimsProps {
  claims: WaiverClaim[];
  playerNames?: Record<string, string>;
  isLoading: boolean;
  onCancel: (claimId: string) => void;
}

export function MyWaiverClaims({ claims, playerNames, isLoading, onCancel }: MyWaiverClaimsProps) {
  if (isLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading claims...</p>;
  }

  if (claims.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No pending waiver claims</p>;
  }

  return (
    <div className="space-y-2">
      {claims.map((claim) => (
        <div
          key={claim.id}
          className="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-gray-900 dark:text-white">{playerNames?.[claim.player_id] || claim.player_id}</span>
              {claim.faab_amount > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">${claim.faab_amount}</span>
              )}
            </div>
            {claim.drop_player_id && (
              <p className="text-xs text-gray-500 dark:text-gray-400">Dropping: {playerNames?.[claim.drop_player_id] || claim.drop_player_id}</p>
            )}
            {claim.process_at && (
              <p className="text-xs text-gray-400">
                Processes: {new Date(claim.process_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <button
            onClick={() => onCancel(claim.id)}
            className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Cancel claim"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
