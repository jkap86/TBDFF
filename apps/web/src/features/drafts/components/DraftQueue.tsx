'use client';

import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';
import type { DraftQueueItem } from '@/lib/api';

interface DraftQueueProps {
  queue: DraftQueueItem[];
  draftedPlayerIds: Set<string>;
  onReorder: (playerIds: string[]) => void;
  onRemove: (playerId: string) => void;
  onUpdateMaxBid?: (playerId: string, maxBid: number | null) => void;
  isAuction?: boolean;
  budget?: number;
}

function MaxBidInput({ item, budget, onUpdateMaxBid }: {
  item: DraftQueueItem;
  budget: number;
  onUpdateMaxBid: (playerId: string, maxBid: number | null) => void;
}) {
  const defaultBid = item.auction_value != null
    ? Math.floor(item.auction_value * 0.8 * (budget / 200))
    : null;
  const [value, setValue] = useState(item.max_bid != null ? String(item.max_bid) : '');
  const [isFocused, setIsFocused] = useState(false);

  // Sync when server state changes
  useEffect(() => {
    if (!isFocused) {
      setValue(item.max_bid != null ? String(item.max_bid) : '');
    }
  }, [item.max_bid, isFocused]);

  const commit = () => {
    setIsFocused(false);
    const trimmed = value.trim();
    if (trimmed === '') {
      // Clear to use default
      if (item.max_bid != null) onUpdateMaxBid(item.player_id, null);
      return;
    }
    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num < 0) {
      // Reset to current
      setValue(item.max_bid != null ? String(item.max_bid) : '');
      return;
    }
    if (num !== item.max_bid) {
      onUpdateMaxBid(item.player_id, num);
    }
  };

  return (
    <div className="flex items-center gap-0.5">
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
        title={defaultBid != null ? `Default: $${defaultBid} (80% of AAV $${item.auction_value})` : 'Set max bid'}
        className="w-10 rounded border border-gray-200 dark:border-gray-600 px-1 py-0.5 text-center text-xs text-gray-700 dark:text-gray-300 dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

export function DraftQueue({ queue, draftedPlayerIds, onReorder, onRemove, onUpdateMaxBid, isAuction, budget }: DraftQueueProps) {
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const ids = queue.map((q) => q.player_id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    onReorder(ids);
  };

  const handleMoveDown = (index: number) => {
    if (index >= queue.length - 1) return;
    const ids = queue.map((q) => q.player_id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    onReorder(ids);
  };

  const availableCount = queue.filter((q) => !draftedPlayerIds.has(q.player_id)).length;
  const showBids = isAuction && onUpdateMaxBid && budget;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          {availableCount} available
        </span>
      </div>

      {showBids && queue.length > 0 && (
        <div className="border-b border-gray-100 dark:border-gray-700 px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500">
          Set max auto-bid per player (blank = default 80% AAV)
        </div>
      )}

      {queue.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
          No players queued. Use the Players tab to add players.
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-gray-100 dark:divide-gray-700 overflow-y-auto">
          {queue.map((item, index) => {
            const isDrafted = draftedPlayerIds.has(item.player_id);
            return (
              <li
                key={item.player_id}
                className={`flex items-center gap-2 px-3 py-2 ${isDrafted ? 'bg-gray-50 dark:bg-gray-800 opacity-50' : ''}`}
              >
                <span className="w-5 text-center text-xs font-medium text-gray-400 dark:text-gray-500">{index + 1}</span>
                <div className={`flex-1 min-w-0 ${isDrafted ? 'line-through' : ''}`}>
                  <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {item.full_name || item.player_id}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {item.position}{item.team ? ` - ${item.team}` : ''}
                  </div>
                </div>
                {isDrafted && (
                  <span className="shrink-0 rounded bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                    Drafted
                  </span>
                )}
                {showBids && !isDrafted && (
                  <MaxBidInput item={item} budget={budget} onUpdateMaxBid={onUpdateMaxBid} />
                )}
                {!isDrafted && (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="rounded p-0.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 disabled:invisible"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index >= queue.length - 1}
                      className="rounded p-0.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 disabled:invisible"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <button
                  onClick={() => onRemove(item.player_id)}
                  className="rounded p-0.5 text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
