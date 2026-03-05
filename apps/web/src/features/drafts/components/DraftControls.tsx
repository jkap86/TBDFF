'use client';

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
}: DraftControlsProps) {
  return (
    <div className="rounded-lg bg-card p-4 shadow">
      <div className="flex items-center gap-4">
        {/* Timer */}
        {timeRemaining !== null && (
          <div className={`flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-lg font-bold ${
            clockState === 'stopped'
              ? 'bg-destructive text-destructive-foreground'
              : clockState === 'paused'
                ? 'bg-yellow-100 text-yellow-800'
                : timeRemaining <= 30
                  ? 'bg-destructive text-destructive-foreground'
                  : timeRemaining <= 60
                    ? 'bg-warning text-warning-foreground'
                    : 'bg-muted text-accent-foreground'
          }`}>
            {formatTime(timeRemaining)}
            {clockState === 'paused' && <span className="text-xs font-semibold">PAUSED</span>}
            {clockState === 'stopped' && <span className="text-xs font-semibold">STOPPED</span>}
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
        {isMyTurn && !isAutoPick && clockState !== 'stopped' && (
          <span className="rounded-full bg-success px-3 py-1 text-sm font-medium text-success-foreground">
            Your Pick!
          </span>
        )}
        {isMyTurn && !isAutoPick && clockState === 'stopped' && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
            Picks disabled
          </span>
        )}
        {isMyTurn && isAutoPick && (
          <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700">
            Auto-picking...
          </span>
        )}
        {nextPick && !isMyTurn && (
          <span className="text-sm text-muted-foreground">
            Waiting for pick #{nextPick.pick_no} (Round {nextPick.round})
          </span>
        )}
      </div>
      {pickError && (
        <p className="mt-2 text-sm text-destructive-foreground">{pickError}</p>
      )}
    </div>
  );
}
