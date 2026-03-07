'use client';

import type { WaiverClaim } from '@/lib/api';
import { Pencil, X } from 'lucide-react';

interface MyWaiverClaimsProps {
  claims: WaiverClaim[];
  playerNames?: Record<string, string>;
  isLoading: boolean;
  onCancel: (claimId: string) => void;
  onEdit?: (claim: WaiverClaim) => void;
}

export function MyWaiverClaims({ claims, playerNames, isLoading, onCancel, onEdit }: MyWaiverClaimsProps) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading claims...</p>;
  }

  if (claims.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending waiver claims</p>;
  }

  return (
    <div className="space-y-2">
      {claims.map((claim) => (
        <div
          key={claim.id}
          className="flex items-center justify-between rounded border border-border p-3 bg-card"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-foreground">{playerNames?.[claim.player_id] || claim.player_id}</span>
              {claim.faab_amount > 0 && (
                <span className="text-xs text-muted-foreground">${claim.faab_amount}</span>
              )}
            </div>
            {claim.drop_player_id && (
              <p className="text-xs text-muted-foreground">Dropping: {playerNames?.[claim.drop_player_id] || claim.drop_player_id}</p>
            )}
            {claim.process_at && (
              <p className="text-xs text-disabled">
                Processes: {new Date(claim.process_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {claim.status === 'pending' && onEdit && (
              <button
                onClick={() => onEdit(claim)}
                className="rounded p-1 text-disabled hover:text-accent-foreground hover:bg-muted"
                title="Edit claim"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => onCancel(claim.id)}
              className="rounded p-1 text-disabled hover:text-destructive-foreground hover:bg-muted"
              title="Cancel claim"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
