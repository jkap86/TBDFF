'use client';

import { useState } from 'react';
import type { Roster, PlaceWaiverClaimRequest } from '@/lib/api';

interface WaiverClaimFormProps {
  playerId: string;
  roster: Roster;
  waiverType: number;
  onSubmit: (data: PlaceWaiverClaimRequest) => Promise<void>;
  onCancel: () => void;
}

export function WaiverClaimForm({ playerId, roster, waiverType, onSubmit, onCancel }: WaiverClaimFormProps) {
  const [dropPlayerId, setDropPlayerId] = useState('');
  const [faabAmount, setFaabAmount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit({
        player_id: playerId,
        drop_player_id: dropPlayerId || undefined,
        faab_amount: waiverType === 2 ? faabAmount : undefined,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to place claim');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Waiver Claim for {playerId}</h4>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* FAAB bid for FAAB leagues */}
      {waiverType === 2 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">FAAB Bid ($)</label>
          <input
            type="number"
            min={0}
            value={faabAmount}
            onChange={(e) => setFaabAmount(parseInt(e.target.value) || 0)}
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-900 dark:text-white"
          />
        </div>
      )}

      {/* Drop player selector */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Drop Player (optional)</label>
        <select
          value={dropPlayerId}
          onChange={(e) => setDropPlayerId(e.target.value)}
          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-900 dark:text-white"
        >
          <option value="">None</option>
          {roster.players.map((pid) => (
            <option key={pid} value={pid}>{pid}</option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Placing...' : 'Place Claim'}
        </button>
      </div>
    </div>
  );
}
