'use client';

import { useState, useEffect } from 'react';
import type { Draft, DraftQueueItem } from '@/lib/api';

function NominationMaxBid({ nomination, queue, budget, onUpdateMaxBid }: {
  nomination: { player_id: string; player_metadata?: { auction_value?: number | null } };
  queue: DraftQueueItem[];
  budget: number;
  onUpdateMaxBid: (playerId: string, maxBid: number | null) => void;
}) {
  const queueItem = queue.find((q) => q.player_id === nomination.player_id);
  const currentMaxBid = queueItem?.max_bid ?? null;
  const aav = nomination.player_metadata?.auction_value ?? queueItem?.auction_value ?? null;
  const defaultBid = aav != null ? Math.floor(aav * 0.8 * (budget / 200)) : null;

  const [value, setValue] = useState(currentMaxBid != null ? String(currentMaxBid) : '');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setValue(currentMaxBid != null ? String(currentMaxBid) : '');
    }
  }, [currentMaxBid, isFocused]);

  const commit = () => {
    setIsFocused(false);
    const trimmed = value.trim();
    if (trimmed === '') {
      if (currentMaxBid != null) onUpdateMaxBid(nomination.player_id, null);
      return;
    }
    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num < 0) {
      setValue(currentMaxBid != null ? String(currentMaxBid) : '');
      return;
    }
    if (num !== currentMaxBid) {
      onUpdateMaxBid(nomination.player_id, num);
    }
  };

  return (
    <div className="flex items-center gap-1 border-l border-gray-200 dark:border-gray-700 pl-2 ml-1">
      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Auto-bid up to</span>
      <span className="text-xs text-gray-400 dark:text-gray-500">$</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={() => setIsFocused(true)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder={defaultBid != null ? String(defaultBid) : '—'}
        title={defaultBid != null ? `Default: $${defaultBid} (80% of AAV $${aav})` : 'Set max auto-bid'}
        className="w-14 rounded border border-gray-200 dark:border-gray-600 px-1 py-1 text-center text-sm text-gray-700 dark:text-gray-300 dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

interface AuctionControlsProps {
  draft: Draft;
  timeRemaining: number | null;
  formatTime: (seconds: number) => string;
  userSlot: number | undefined;
  isMyTurn: boolean;
  isAutoPick: boolean;
  isTogglingAutoPick: boolean;
  nominateAmount: number;
  setNominateAmount: (v: number) => void;
  bidAmount: number;
  setBidAmount: (v: number) => void;
  isBidding: boolean;
  pickError: string | null;
  queue: DraftQueueItem[];
  onBid: (amount?: number) => void;
  onToggleAutoPick: () => void;
  onNominationMaxBid: (playerId: string, maxBid: number | null) => void;
}

export function AuctionControls({
  draft,
  timeRemaining,
  formatTime,
  userSlot,
  isMyTurn,
  isAutoPick,
  isTogglingAutoPick,
  nominateAmount,
  setNominateAmount,
  bidAmount,
  setBidAmount,
  isBidding,
  pickError,
  queue,
  onBid,
  onToggleAutoPick,
  onNominationMaxBid,
}: AuctionControlsProps) {
  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
      <div className="flex flex-wrap items-center gap-4">
        {/* Timer */}
        {timeRemaining !== null && (
          <div className={`flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-lg font-bold ${
            timeRemaining <= 10
              ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
              : timeRemaining <= 20
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}>
            {formatTime(timeRemaining)}
            <span className="text-xs font-normal dark:text-gray-300">
              {draft.metadata?.current_nomination ? 'Bidding' : 'Nominate'}
            </span>
          </div>
        )}
        {/* Autopick Toggle */}
        {userSlot !== undefined && (
          <button
            onClick={onToggleAutoPick}
            disabled={isTogglingAutoPick}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isAutoPick
                ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            } disabled:opacity-50`}
          >
            {isTogglingAutoPick ? '...' : isAutoPick ? 'Auto: ON' : 'Auto: OFF'}
          </button>
        )}

        {/* Nomination (no active nomination, user's turn) */}
        {!draft.metadata?.current_nomination && isMyTurn && !isAutoPick && (
          <div className="flex flex-1 items-center gap-2">
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
              Your Nomination!
            </span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500 dark:text-gray-400">Starting bid: $</span>
              <input
                type="number"
                value={nominateAmount}
                onChange={(e) => setNominateAmount(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <span className="text-sm text-gray-400 dark:text-gray-500">
              Select a player from the Players tab
            </span>
          </div>
        )}

        {/* Waiting for nomination */}
        {!draft.metadata?.current_nomination && !isMyTurn && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Waiting for nomination...
          </span>
        )}

        {/* Bidding Controls (active nomination) */}
        {draft.metadata?.current_nomination && userSlot !== undefined && (
          <div className="flex flex-1 items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Current: <span className="text-green-700 font-bold">${draft.metadata.current_nomination.current_bid}</span>
            </span>
            <button
              onClick={() => onBid(draft.metadata.current_nomination!.current_bid + 1)}
              disabled={isBidding}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              +$1
            </button>
            <button
              onClick={() => onBid(draft.metadata.current_nomination!.current_bid + 5)}
              disabled={isBidding}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              +$5
            </button>
            <button
              onClick={() => onBid(draft.metadata.current_nomination!.current_bid + 10)}
              disabled={isBidding}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              +$10
            </button>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500 dark:text-gray-400">$</span>
              <input
                type="number"
                value={bidAmount || ''}
                onChange={(e) => setBidAmount(parseInt(e.target.value) || 0)}
                placeholder="Custom"
                min={1}
                className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => onBid()}
              disabled={isBidding || bidAmount < 1}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isBidding ? 'Bidding...' : 'Bid'}
            </button>
            <NominationMaxBid
              nomination={draft.metadata.current_nomination}
              queue={queue}
              budget={draft.settings.budget}
              onUpdateMaxBid={onNominationMaxBid}
            />
          </div>
        )}
      </div>
      {pickError && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{pickError}</p>
      )}
    </div>
  );
}
