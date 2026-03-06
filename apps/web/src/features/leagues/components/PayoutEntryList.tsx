'use client';

import { Trash2 } from 'lucide-react';
import type { PayoutEntry, PayoutCategory } from '@tbdff/shared';

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

interface PayoutEntryListProps {
  entries: PayoutEntry[];
  onRemove: (category: PayoutCategory, position: number) => void;
}

export function PayoutEntryList({ entries, onRemove }: PayoutEntryListProps) {
  return (
    <div className="space-y-1">
      {entries.map((entry) => (
        <div
          key={`${entry.category}-${entry.position}`}
          className="flex items-center justify-between rounded border border-border px-3 py-2"
        >
          <span className="text-sm font-medium text-foreground">
            {ordinal(entry.position)}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-success-foreground">
              {entry.is_percentage ? `${entry.value}%` : `$${entry.value.toFixed(2)}`}
            </span>
            <button
              type="button"
              onClick={() => onRemove(entry.category, entry.position)}
              className="rounded p-1 text-disabled hover:bg-destructive hover:text-destructive-foreground"
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
