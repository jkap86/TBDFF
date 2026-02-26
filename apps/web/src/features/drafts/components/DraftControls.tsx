'use client';

import type { DraftPick } from '@/lib/api';

interface DraftControlsProps {
  timeRemaining: number | null;
  formatTime: (seconds: number) => string;
  userSlot: number | undefined;
  isMyTurn: boolean;
  isAutoPick: boolean;
  isTogglingAutoPick: boolean;
  isCommissioner: boolean;
  nextPick: DraftPick | undefined;
  pickPlayerId: string;
  setPickPlayerId: (v: string) => void;
  isPicking: boolean;
  pickError: string | null;
  onMakePick: () => void;
  onToggleAutoPick: () => void;
}

export function DraftControls({
  timeRemaining,
  formatTime,
  userSlot,
  isMyTurn,
  isAutoPick,
  isTogglingAutoPick,
  isCommissioner,
  nextPick,
  pickPlayerId,
  setPickPlayerId,
  isPicking,
  pickError,
  onMakePick,
  onToggleAutoPick,
}: DraftControlsProps) {
  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
      <div className="flex items-center gap-4">
        {/* Timer */}
        {timeRemaining !== null && (
          <div className={`flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-lg font-bold ${
            timeRemaining <= 30
              ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
              : timeRemaining <= 60
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}>
            {formatTime(timeRemaining)}
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
        {isMyTurn && !isAutoPick && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
            Your Pick!
          </span>
        )}
        {isMyTurn && isAutoPick && (
          <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700">
            Auto-picking...
          </span>
        )}
        {nextPick && !isMyTurn && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Waiting for pick #{nextPick.pick_no} (Round {nextPick.round})
          </span>
        )}
        {((isMyTurn && !isAutoPick) || isCommissioner) && (
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={pickPlayerId}
              onChange={(e) => setPickPlayerId(e.target.value)}
              placeholder="Enter Player ID"
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && onMakePick()}
            />
            <button
              onClick={onMakePick}
              disabled={isPicking || !pickPlayerId.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isPicking ? 'Picking...' : 'Pick'}
            </button>
          </div>
        )}
      </div>
      {pickError && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{pickError}</p>
      )}
    </div>
  );
}
