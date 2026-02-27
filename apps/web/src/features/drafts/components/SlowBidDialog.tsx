'use client';

import { useState, useEffect } from 'react';
import type { AuctionLot, RosterBudget } from '@/lib/api';

interface SlowBidDialogProps {
  lot: AuctionLot;
  myBudget: RosterBudget | null;
  minBid: number;
  minIncrement: number;
  onSubmit: (lotId: string, maxBid: number) => Promise<void>;
  onClose: () => void;
}

export function SlowBidDialog({ lot, myBudget, minBid, minIncrement, onSubmit, onClose }: SlowBidDialogProps) {
  const currentBid = lot.current_bid;
  const myMaxBid = lot.my_max_bid;
  const suggestedMin = myMaxBid != null
    ? Math.max(myMaxBid + minIncrement, currentBid + minIncrement)
    : Math.max(currentBid + minIncrement, minBid);

  const [bidValue, setBidValue] = useState(String(suggestedMin));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBidValue(String(suggestedMin));
  }, [suggestedMin]);

  const parsedBid = parseInt(bidValue, 10);
  const isValid = !isNaN(parsedBid) && parsedBid >= minBid;
  const maxAffordable = myBudget?.available ?? 999;

  const handleSubmit = async () => {
    if (!isValid) return;
    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit(lot.id, parsedBid);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to place bid');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deadline = new Date(lot.bid_deadline);
  const now = new Date();
  const msRemaining = deadline.getTime() - now.getTime();
  const hoursRemaining = Math.max(0, msRemaining / (1000 * 60 * 60));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
          Set Max Bid
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Your max bid is sealed. You'll pay just enough to win (second-price).
        </p>

        {/* Player info */}
        <div className="rounded-lg bg-gray-50 dark:bg-gray-700 p-3 mb-4">
          <div className="font-medium text-gray-900 dark:text-white">
            Player #{lot.player_id}
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-600 dark:text-gray-400">
            <span>Current bid: <span className="font-bold text-green-700">${currentBid}</span></span>
            <span>Bids: {lot.bid_count}</span>
            <span>
              {hoursRemaining > 1
                ? `${Math.floor(hoursRemaining)}h ${Math.round((hoursRemaining % 1) * 60)}m left`
                : `${Math.max(0, Math.round(hoursRemaining * 60))}m left`}
            </span>
          </div>
          {myMaxBid != null && (
            <div className="mt-1 text-sm text-blue-600 dark:text-blue-400">
              Your current max bid: ${myMaxBid}
            </div>
          )}
        </div>

        {/* Budget info */}
        {myBudget && (
          <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400 mb-4">
            <span>Budget: ${myBudget.total_budget}</span>
            <span>Spent: ${myBudget.spent}</span>
            <span>Available: <span className="font-medium text-gray-900 dark:text-white">${myBudget.available}</span></span>
            <span>Players: {myBudget.won_count}/{myBudget.total_slots}</span>
          </div>
        )}

        {/* Bid input */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg text-gray-500 dark:text-gray-400">$</span>
          <input
            type="text"
            inputMode="numeric"
            value={bidValue}
            onChange={(e) => setBidValue(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter' && isValid) handleSubmit(); }}
            autoFocus
            className="w-32 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xl font-bold text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {parsedBid > maxAffordable && (
            <span className="text-xs text-red-500">Exceeds budget</span>
          )}
        </div>

        {/* Quick bid buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          {[suggestedMin, currentBid + 5, currentBid + 10, currentBid + 25].filter((v, i, a) => a.indexOf(v) === i && v >= minBid).map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setBidValue(String(val))}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                parsedBid === val
                  ? 'border-blue-300 bg-blue-100 text-blue-700'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              ${val}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Placing Bid...' : `Set Max Bid $${isValid ? parsedBid : '—'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
