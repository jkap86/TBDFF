'use client';

import { useState } from 'react';
import type { Roster, PlaceWaiverClaimRequest } from '@/lib/api';

interface WaiverClaimFormProps {
  playerId: string;
  playerName?: string;
  roster: Roster;
  playerNames?: Record<string, string>;
  waiverType: number;
  onSubmit: (data: PlaceWaiverClaimRequest) => Promise<void>;
  onCancel: () => void;
}

export function WaiverClaimForm({ playerId, playerName, roster, playerNames, waiverType, onSubmit, onCancel }: WaiverClaimFormProps) {
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
    <div className="space-y-3 p-4 border border-border rounded-lg bg-surface">
      <h4 className="text-sm font-medium text-accent-foreground">Waiver Claim for {playerName || playerId}</h4>

      {error && (
        <p className="text-xs text-destructive-foreground">{error}</p>
      )}

      {/* FAAB bid for FAAB leagues */}
      {waiverType === 2 && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">FAAB Bid ($)</label>
          <input
            type="number"
            min={0}
            value={faabAmount}
            onChange={(e) => setFaabAmount(parseInt(e.target.value) || 0)}
            className="w-full rounded border border-input bg-card px-2 py-1 text-sm text-foreground"
          />
        </div>
      )}

      {/* Drop player selector */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Drop Player (optional)</label>
        <select
          value={dropPlayerId}
          onChange={(e) => setDropPlayerId(e.target.value)}
          className="w-full rounded border border-input bg-card px-2 py-1 text-sm text-foreground"
        >
          <option value="">None</option>
          {roster.players.map((pid) => (
            <option key={pid} value={pid}>{playerNames?.[pid] || pid}</option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded px-3 py-1 text-xs font-medium text-accent-foreground hover:bg-muted-hover"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {isSubmitting ? 'Placing...' : 'Place Claim'}
        </button>
      </div>
    </div>
  );
}
