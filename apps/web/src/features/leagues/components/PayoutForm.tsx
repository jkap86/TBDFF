'use client';

import { useState } from 'react';
import type { PayoutCategory, PayoutEntry } from '@tbdff/shared';

interface PayoutFormProps {
  payouts: PayoutEntry[];
  buyIn: number;
  totalRosters: number;
  onAdd: (entry: PayoutEntry) => void;
  onCancel: () => void;
  onError?: (message: string) => void;
}

function wouldOverAllocate(
  currentPayouts: PayoutEntry[],
  newEntry: PayoutEntry,
  buyIn: number,
  totalRosters: number,
): boolean {
  const totalPot = buyIn * totalRosters;
  if (totalPot <= 0) return false;
  let totalAllocated = 0;
  for (const entry of [...currentPayouts, newEntry]) {
    totalAllocated += entry.is_percentage ? (entry.value / 100) * totalPot : entry.value;
  }
  return totalAllocated > totalPot + 0.01;
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function PayoutForm({ payouts, buyIn, totalRosters, onAdd, onCancel, onError }: PayoutFormProps) {
  const [category, setCategory] = useState<PayoutCategory>('place');
  const [position, setPosition] = useState('');
  const [value, setValue] = useState('');
  const [isPercentage, setIsPercentage] = useState(false);

  const handleAdd = () => {
    const pos = parseInt(position, 10);
    const val = parseFloat(value);

    if (isNaN(pos) || pos < 1) {
      onError?.('Enter a valid position (1, 2, 3...)');
      return;
    }
    if (isNaN(val) || val <= 0) {
      onError?.('Enter a valid amount');
      return;
    }
    if (isPercentage && val > 100) {
      onError?.('Percentage cannot exceed 100');
      return;
    }

    const duplicate = payouts.find((e) => e.category === category && e.position === pos);
    if (duplicate) {
      onError?.(`${category === 'place' ? 'Place' : 'Points'} ${ordinal(pos)} already exists`);
      return;
    }

    const newEntry: PayoutEntry = { category, position: pos, value: val, is_percentage: isPercentage };
    if (wouldOverAllocate(payouts, newEntry, buyIn, totalRosters)) {
      onError?.('Cannot add — this would exceed the total pot');
      return;
    }

    onAdd(newEntry);
    setPosition('');
    setValue('');
  };

  return (
    <div className="mb-3 rounded border border-primary/20 bg-primary/10 p-3 space-y-2">
      <div className="flex gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as PayoutCategory)}
          className="rounded border border-input bg-card px-2 py-1.5 text-sm text-foreground"
        >
          <option value="place">Place Finish</option>
          <option value="points">Points Finish</option>
        </select>
        <input
          type="number"
          min="1"
          step="1"
          placeholder="Position (1, 2, 3...)"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          className="w-full flex-1 rounded border border-input bg-card px-2 py-1.5 text-sm text-foreground"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex items-center gap-1 flex-1">
          <span className="text-sm text-muted-foreground">
            {isPercentage ? '%' : '$'}
          </span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Amount"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border border-input bg-card px-2 py-1.5 text-sm text-foreground"
          />
        </div>
        <select
          value={isPercentage ? 'percent' : 'dollar'}
          onChange={(e) => setIsPercentage(e.target.value === 'percent')}
          className="rounded border border-input bg-card px-2 py-1.5 text-sm text-foreground"
        >
          <option value="dollar">$</option>
          <option value="percent">%</option>
        </select>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleAdd}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Add
        </button>
      </div>
    </div>
  );
}
