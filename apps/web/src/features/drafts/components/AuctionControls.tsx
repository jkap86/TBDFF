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
    <div className="flex items-center gap-1.5 border-l border-border pl-3 ml-1">
      <span className="text-[10px] font-heading font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Max $</span>
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
        className="w-14 rounded-lg border border-border bg-card px-1.5 py-1.5 text-center text-sm font-mono font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
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

  const timerLabel = clockState === 'paused' ? 'PAUSED' : clockState === 'stopped' ? 'STOPPED' : draft.metadata?.current_nomination ? 'BID' : 'NOM';

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-3">
        {/* Timer */}
        {timeRemaining !== null && (
          <div
            className={`flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-xl font-bold tracking-tight transition-colors ${
              clockState === 'stopped'
                ? 'bg-destructive/15 text-destructive-foreground border border-destructive-foreground/30'
                : clockState === 'paused'
                  ? 'bg-warning/15 text-warning-foreground border border-warning-foreground/30'
                  : timeRemaining <= 10
                    ? 'bg-destructive/15 text-destructive-foreground border border-destructive-foreground/30'
                    : timeRemaining <= 20
                      ? 'bg-warning/15 text-warning-foreground border border-warning-foreground/30'
                      : 'bg-primary/10 text-primary border border-primary/30'
            }`}
          >
            {formatTime(timeRemaining)}
            <span className="text-[10px] font-heading font-bold uppercase tracking-widest opacity-70">
              {timerLabel}
            </span>
          </div>
        )}

        {/* Commissioner Controls */}
        {isCommissioner && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onPause}
              className={`rounded-lg px-3 py-2 text-xs font-heading font-bold uppercase tracking-wide transition-colors ${
                clockState === 'paused'
                  ? 'bg-warning/15 text-warning-foreground border border-warning-foreground/30 hover:bg-warning/25'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30'
              }`}
            >
              {clockState === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={onStop}
              className={`rounded-lg px-3 py-2 text-xs font-heading font-bold uppercase tracking-wide transition-colors ${
                clockState === 'stopped'
                  ? 'bg-destructive/15 text-destructive-foreground border border-destructive-foreground/30 hover:bg-destructive/25'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30'
              }`}
            >
              {clockState === 'stopped' ? 'Resume' : 'Stop'}
            </button>
          </div>
        )}

        {/* Divider */}
        {(timeRemaining !== null || isCommissioner) && (
          <div className="hidden sm:block h-8 w-px bg-border" />
        )}

        {/* Autopick Toggle */}
        {userSlot !== undefined && (
          <button
            onClick={onToggleAutoPick}
            disabled={isTogglingAutoPick}
            className={`rounded-full px-3 py-1.5 text-xs font-heading font-bold uppercase tracking-wide transition-all disabled:opacity-50 ${
              isAutoPick
                ? 'bg-neon-orange/15 text-neon-orange border border-neon-orange/40'
                : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30'
            }`}
          >
            {isTogglingAutoPick ? '...' : isAutoPick ? 'Auto ON' : 'Auto OFF'}
          </button>
        )}

        {/* Nomination (no active nomination, user's turn) */}
        {!draft.metadata?.current_nomination && isMyTurn && !isAutoPick && !isStopped && (
          <div className="flex flex-1 items-center gap-3">
            <span className="rounded-full bg-primary/15 border border-primary/40 px-3 py-1 text-xs font-heading font-bold uppercase tracking-wide text-primary">
              Your Nomination
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-heading font-bold uppercase tracking-wide text-muted-foreground">Bid $</span>
              <input
                type="number"
                value={nominateAmount}
                onChange={(e) => setNominateAmount(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                className="w-16 rounded-lg border border-border bg-card px-2 py-1.5 text-center text-sm font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              Select a player from the Players tab
            </span>
          </div>
        )}

        {/* Stopped indicator */}
        {!draft.metadata?.current_nomination && isMyTurn && !isAutoPick && isStopped && (
          <span className="rounded-full bg-destructive/15 border border-destructive-foreground/30 px-3 py-1 text-xs font-heading font-bold uppercase tracking-wide text-destructive-foreground">
            Nominations Paused
          </span>
        )}

        {/* Waiting for nomination */}
        {!draft.metadata?.current_nomination && !isMyTurn && (
          <span className="text-xs font-heading font-bold uppercase tracking-wide text-muted-foreground">
            Waiting for nomination...
          </span>
        )}

        {/* Bidding Controls (active nomination) */}
        {draft.metadata?.current_nomination && userSlot !== undefined && (
          <div className="flex flex-1 items-center gap-3">
            {/* Stepper bid input */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setLocalBid((prev) => Math.max(minBid, prev - 1))}
                disabled={isBidding || isStopped || localBid <= minBid}
                className="bg-card px-3 py-2 text-base font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-20 disabled:cursor-not-allowed border-r border-border"
              >
                −
              </button>
              <div className="flex items-center bg-card px-1">
                <span className="text-xs text-muted-foreground pl-1.5">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={localBid}
                  onFocus={() => setIsEditing(true)}
                  onChange={handleBidInputChange}
                  onBlur={handleBidInputBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-12 bg-transparent py-2 pr-1 text-center text-base font-mono font-bold text-foreground focus:outline-none"
                />
              </div>
              <button
                onClick={() => setLocalBid((prev) => Math.min(maxBid, prev + 1))}
                disabled={isBidding || isStopped || localBid >= maxBid}
                className="bg-card px-3 py-2 text-base font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-20 disabled:cursor-not-allowed border-l border-border"
              >
                +
              </button>
            </div>

            {/* Place Bid button */}
            <button
              onClick={() => onBid(localBid)}
              disabled={isBidding || localBid < minBid || localBid > maxBid || isStopped}
              className="rounded-lg bg-primary px-5 py-2 text-xs font-heading font-bold uppercase tracking-wide text-primary-foreground hover:bg-primary-hover disabled:opacity-40 transition-colors glow-primary"
            >
              {isBidding ? 'Bidding...' : 'Place Bid'}
            </button>

            {/* Auto-bid max */}
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
        <p className="mt-2 text-xs font-medium text-destructive-foreground">{pickError}</p>
      )}
    </div>
  );
}
