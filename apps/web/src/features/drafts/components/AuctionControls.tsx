'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Draft, DraftQueueItem } from '@/lib/api';

function NominationMaxBid({ nomination, queue, budget, teams, onUpdateMaxBid }: {
  nomination: { player_id: string; player_metadata?: { auction_value?: number | null } };
  queue: DraftQueueItem[];
  budget: number;
  teams: number;
  onUpdateMaxBid: (playerId: string, maxBid: number | null) => void;
}) {
  const queueItem = queue.find((q) => q.player_id === nomination.player_id);
  const currentMaxBid = queueItem?.max_bid ?? null;
  const aav = nomination.player_metadata?.auction_value ?? queueItem?.auction_value ?? null;
  const defaultBid = aav != null ? Math.floor(aav * 0.8 * (budget / 200) * (teams / 12)) : null;

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
    <div className="flex items-center gap-1 border-l border-border pl-2 ml-1">
      <span className="text-xs text-muted-foreground whitespace-nowrap">Auto-bid up to</span>
      <span className="text-xs text-disabled">$</span>
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
        className="w-14 rounded border border-border px-1 py-1 text-center text-sm text-accent-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
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
  isCommissioner?: boolean;
  clockState?: 'running' | 'paused' | 'stopped';
  onPause?: () => void;
  onStop?: () => void;
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
  isCommissioner,
  clockState = 'running',
  onPause,
  onStop,
}: AuctionControlsProps) {
  const isStopped = clockState === 'stopped';

  // Compute bid constraints for stepper
  const nominationData = draft.metadata?.current_nomination as Record<string, any> | undefined;
  const currentBid = (nominationData?.current_bid as number) ?? 0;
  const userRosterId = userSlot !== undefined ? (draft.slot_to_roster_id ?? {} as Record<string, number>)[String(userSlot)] : undefined;
  const userBudget = userRosterId != null ? ((draft.metadata?.auction_budgets ?? {} as Record<string, number>)[String(userRosterId)] ?? 0) : 0;
  const minBid = currentBid + 1;
  const maxBid = userBudget;

  const [localBid, setLocalBid] = useState(minBid);
  const [isEditing, setIsEditing] = useState(false);

  // Reset bid to current + 1 whenever the current bid changes (new bid placed by anyone)
  useEffect(() => {
    if (!isEditing) {
      setLocalBid(currentBid + 1);
    }
  }, [currentBid, isEditing]);

  const handleBidInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (raw === '') {
      setLocalBid(0);
    } else {
      setLocalBid(parseInt(raw, 10));
    }
  }, []);

  const handleBidInputBlur = useCallback(() => {
    setIsEditing(false);
    // Clamp value on blur
    setLocalBid((prev) => Math.max(minBid, Math.min(maxBid, prev)));
  }, [minBid, maxBid]);

  return (
    <div className="rounded-lg bg-card p-4 shadow">
      <div className="flex flex-wrap items-center gap-4">
        {/* Timer */}
        {timeRemaining !== null && (
          <div className={`flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-lg font-bold ${
            clockState === 'stopped'
              ? 'bg-destructive text-destructive-foreground'
              : clockState === 'paused'
                ? 'bg-yellow-100 text-yellow-800'
                : timeRemaining <= 10
                  ? 'bg-destructive text-destructive-foreground'
                  : timeRemaining <= 20
                    ? 'bg-warning text-warning-foreground'
                    : 'bg-muted text-accent-foreground'
          }`}>
            {formatTime(timeRemaining)}
            <span className="text-xs font-normal text-accent-foreground">
              {clockState === 'paused' ? 'PAUSED' : clockState === 'stopped' ? 'STOPPED' : draft.metadata?.current_nomination ? 'Bidding' : 'Nominate'}
            </span>
          </div>
        )}
        {/* Commissioner Pause/Stop Controls */}
        {isCommissioner && (
          <div className="flex items-center gap-2">
            <button
              onClick={onPause}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                clockState === 'paused'
                  ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                  : 'bg-muted text-muted-foreground hover:bg-muted-hover'
              }`}
            >
              {clockState === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={onStop}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                clockState === 'stopped'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-muted text-muted-foreground hover:bg-muted-hover'
              }`}
            >
              {clockState === 'stopped' ? 'Resume' : 'Stop'}
            </button>
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
                : 'bg-muted text-muted-foreground hover:bg-muted-hover'
            } disabled:opacity-50`}
          >
            {isTogglingAutoPick ? '...' : isAutoPick ? 'Auto: ON' : 'Auto: OFF'}
          </button>
        )}

        {/* Nomination (no active nomination, user's turn) */}
        {!draft.metadata?.current_nomination && isMyTurn && !isAutoPick && !isStopped && (
          <div className="flex flex-1 items-center gap-2">
            <span className="rounded-full bg-success px-3 py-1 text-sm font-medium text-success-foreground">
              Your Nomination!
            </span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">Starting bid: $</span>
              <input
                type="number"
                value={nominateAmount}
                onChange={(e) => setNominateAmount(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                className="w-20 rounded-lg border border-input px-2 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <span className="text-sm text-disabled">
              Select a player from the Players tab
            </span>
          </div>
        )}

        {/* Stopped indicator when it would be user's turn */}
        {!draft.metadata?.current_nomination && isMyTurn && !isAutoPick && isStopped && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
            Nominations disabled
          </span>
        )}

        {/* Waiting for nomination */}
        {!draft.metadata?.current_nomination && !isMyTurn && (
          <span className="text-sm text-muted-foreground">
            Waiting for nomination...
          </span>
        )}

        {/* Bidding Controls (active nomination) */}
        {draft.metadata?.current_nomination && userSlot !== undefined && (
          <div className="flex flex-1 items-center gap-3">
            {/* Current bid label */}
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Current: <span className="text-success-foreground font-bold">${currentBid}</span>
            </span>

            {/* Stepper bid input */}
            <div className="flex items-center">
              <button
                onClick={() => setLocalBid((prev) => Math.max(minBid, prev - 1))}
                disabled={isBidding || isStopped || localBid <= minBid}
                className="rounded-l-lg border border-r-0 border-input bg-muted px-3 py-2 text-lg font-bold text-foreground hover:bg-muted-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                −
              </button>
              <div className="flex items-center border-y border-input bg-card">
                <span className="text-sm text-muted-foreground pl-2">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={localBid}
                  onFocus={() => setIsEditing(true)}
                  onChange={handleBidInputChange}
                  onBlur={handleBidInputBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-14 bg-transparent py-2 pr-2 text-center text-lg font-bold text-foreground focus:outline-none"
                />
              </div>
              <button
                onClick={() => setLocalBid((prev) => Math.min(maxBid, prev + 1))}
                disabled={isBidding || isStopped || localBid >= maxBid}
                className="rounded-r-lg border border-l-0 border-input bg-muted px-3 py-2 text-lg font-bold text-foreground hover:bg-muted-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                +
              </button>
            </div>

            {/* Place Bid button */}
            <button
              onClick={() => onBid(localBid)}
              disabled={isBidding || localBid < minBid || localBid > maxBid || isStopped}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isBidding ? 'Bidding...' : 'Place Bid'}
            </button>

            {!isStopped && (
              <NominationMaxBid
                nomination={draft.metadata.current_nomination}
                queue={queue}
                budget={draft.settings.budget}
                teams={draft.settings.teams}
                onUpdateMaxBid={onNominationMaxBid}
              />
            )}
          </div>
        )}
      </div>
      {pickError && (
        <p className="mt-2 text-sm text-destructive-foreground">{pickError}</p>
      )}
    </div>
  );
}
