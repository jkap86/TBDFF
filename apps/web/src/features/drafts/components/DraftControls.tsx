'use client';

import { useState } from 'react';
import type { DraftPick } from '@/lib/api';

interface DraftControlsProps {
  timeRemaining: number | null;
  formatTime: (seconds: number) => string;
  userSlot: number | undefined;
  isMyTurn: boolean;
  isAutoPick: boolean;
  isTogglingAutoPick: boolean;
  nextPick: DraftPick | undefined;
  pickError: string | null;
  onToggleAutoPick: () => void;
  isCommissioner?: boolean;
  clockState?: 'running' | 'paused' | 'stopped';
  onPause?: () => void;
  onStop?: () => void;
  onUpdateTimers?: (timers: Record<string, number>) => void;
  pickTimer?: number;
}

export function DraftControls({
  timeRemaining,
  formatTime,
  userSlot,
  isMyTurn,
  isAutoPick,
  isTogglingAutoPick,
  nextPick,
  pickError,
  onToggleAutoPick,
  isCommissioner,
  clockState = 'running',
  onPause,
  onStop,
  onUpdateTimers,
  pickTimer = 120,
}: DraftControlsProps) {
  const [showTimerEdit, setShowTimerEdit] = useState(false);
  const [localPickTimer, setLocalPickTimer] = useState(pickTimer);
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-3">
        {/* Timer */}
        {timeRemaining !== null && (
          <div className={`flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-xl font-bold tracking-tight transition-colors ${
            clockState === 'stopped'
              ? 'bg-destructive/15 text-destructive-foreground border border-destructive-foreground/30'
              : clockState === 'paused'
                ? 'bg-warning/15 text-warning-foreground border border-warning-foreground/30'
                : timeRemaining <= 30
                  ? 'bg-destructive/15 text-destructive-foreground border border-destructive-foreground/30'
                  : timeRemaining <= 60
                    ? 'bg-warning/15 text-warning-foreground border border-warning-foreground/30'
                    : 'bg-primary/10 text-primary border border-primary/30'
          }`}>
            {formatTime(timeRemaining)}
            {clockState === 'paused' && <span className="text-xs font-heading font-bold uppercase tracking-widest opacity-70">PAUSED</span>}
            {clockState === 'stopped' && <span className="text-xs font-heading font-bold uppercase tracking-widest opacity-70">STOPPED</span>}
          </div>
        )}
        {/* Commissioner Pause/Stop Controls */}
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
            <button
              onClick={() => {
                setLocalPickTimer(pickTimer);
                setShowTimerEdit(!showTimerEdit);
              }}
              className={`rounded-lg px-3 py-2 text-xs font-heading font-bold uppercase tracking-wide transition-colors ${
                showTimerEdit
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30'
              }`}
            >
              Timer
            </button>
            {showTimerEdit && (
              <div className="flex items-center gap-2 border-l border-border pl-2 ml-0.5">
                <label className="flex items-center gap-1">
                  <span className="text-xs font-heading font-bold uppercase tracking-wide text-muted-foreground">Pick</span>
                  <input
                    type="number"
                    value={localPickTimer}
                    onChange={(e) => setLocalPickTimer(Math.max(5, parseInt(e.target.value) || 5))}
                    min={5}
                    max={86400}
                    className="w-16 rounded-lg border border-border bg-card px-1.5 py-1.5 text-center text-sm font-mono font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <span className="text-xs text-muted-foreground">s</span>
                </label>
                <button
                  onClick={() => {
                    if (localPickTimer !== pickTimer) onUpdateTimers?.({ pick_timer: localPickTimer });
                    setShowTimerEdit(false);
                  }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-heading font-bold uppercase tracking-wide text-primary-foreground hover:bg-primary-hover transition-colors"
                >
                  Apply
                </button>
              </div>
            )}
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
        {isMyTurn && !isAutoPick && clockState !== 'stopped' && (
          <span className="rounded-full bg-success px-3 py-1 text-sm font-heading font-bold uppercase tracking-wide text-success-foreground border border-success-foreground/30 glow-text">
            Your Pick!
          </span>
        )}
        {isMyTurn && !isAutoPick && clockState === 'stopped' && (
          <span className="rounded-full bg-destructive/15 px-3 py-1 text-sm font-heading font-bold uppercase tracking-wide text-destructive-foreground border border-destructive-foreground/30">
            Picks disabled
          </span>
        )}
        {isMyTurn && isAutoPick && (
          <span className="rounded-full bg-neon-orange/15 px-3 py-1 text-sm font-heading font-bold uppercase tracking-wide text-neon-orange border border-neon-orange/40">
            Auto-picking...
          </span>
        )}
        {nextPick && !isMyTurn && (
          <span className="text-xs font-heading font-bold uppercase tracking-wide text-muted-foreground">
            Waiting for pick #{nextPick.pick_no} (Round {nextPick.round})
          </span>
        )}
      </div>
      {pickError && (
        <p className="mt-2 text-xs font-medium text-destructive-foreground">{pickError}</p>
      )}
    </div>
  );
}
