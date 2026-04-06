'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { draftApi, ApiError } from '@/lib/api';
import type { Draft, LeagueMember, DerbyState } from '@/lib/api';

interface DerbyPickBoardProps {
  draft: Draft;
  members: LeagueMember[];
  userId: string | undefined;
  isCommissioner: boolean;
  accessToken: string;
  onDraftUpdated: (draft: Draft) => void;
}

export function DerbyPickBoard({ draft, members, userId, isCommissioner, accessToken, onDraftUpdated }: DerbyPickBoardProps) {
  const derby = draft.metadata?.derby as DerbyState | undefined;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const autoActionTriggered = useRef(false);

  const totalSlots = derby?.derby_order.length ?? 0;
  const currentPicker = derby ? derby.derby_order[derby.current_pick_index] : null;
  const isMyTurn = currentPicker?.user_id === userId;
  const skippedUsers = derby?.skipped_users ?? [];
  const isSkippedAndCanPick = userId ? skippedUsers.includes(userId) && !derby?.picks.some((p) => p.user_id === userId) : false;
  const canPick = isMyTurn || isSkippedAndCanPick;
  const pastAllTurns = derby ? derby.current_pick_index >= totalSlots : false;

  // Timer countdown
  useEffect(() => {
    if (!derby || derby.status !== 'active' || pastAllTurns) {
      setTimeRemaining(pastAllTurns && skippedUsers.length > 0 ? null : null);
      return;
    }

    const deadline = new Date(derby.pick_deadline).getTime();

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeRemaining(remaining);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [derby?.pick_deadline, derby?.status, derby?.current_pick_index, pastAllTurns, skippedUsers.length]);

  // Reset auto-action flag when deadline changes
  useEffect(() => {
    autoActionTriggered.current = false;
  }, [derby?.pick_deadline]);

  // Auto-action on timer expiry
  const handleAutoAction = useCallback(async () => {
    if (!derby || autoActionTriggered.current || pastAllTurns) return;
    autoActionTriggered.current = true;

    try {
      const result = await draftApi.derbyAutoPick(draft.id, accessToken);
      onDraftUpdated(result.draft);
    } catch {
      // Another client may have already triggered — benign
    }
  }, [derby, pastAllTurns, draft.id, accessToken, onDraftUpdated]);

  useEffect(() => {
    if (timeRemaining === 0 && !pastAllTurns) {
      handleAutoAction();
    }
  }, [timeRemaining, pastAllTurns, handleAutoAction]);

  if (!derby || derby.status !== 'active') return null;

  const handleMakePick = async (slot: number) => {
    try {
      setIsSubmitting(true);
      setPickError(null);
      const result = await draftApi.makeDerbyPick(draft.id, { slot }, accessToken);
      onDraftUpdated(result.draft);
    } catch (err) {
      if (err instanceof ApiError) setPickError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCommissionerAction = async (action: 'autopick' | 'skip') => {
    try {
      setIsSubmitting(true);
      setPickError(null);
      const result = await draftApi.derbyAutoPick(draft.id, accessToken);
      onDraftUpdated(result.draft);
    } catch (err) {
      if (err instanceof ApiError) setPickError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mt-4 rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 glass-subtle border-b border-border">
        <h3 className="text-sm font-heading font-bold uppercase tracking-wide text-foreground">Derby Pick</h3>
        {timeRemaining !== null && !pastAllTurns && (
          <div className={`text-lg font-mono font-bold ${
            timeRemaining <= 10 ? 'text-destructive-foreground animate-pulse' : 'text-foreground'
          }`}>
            {formatTime(timeRemaining)}
          </div>
        )}
        {pastAllTurns && skippedUsers.length > 0 && (
          <span className="text-xs text-warning-foreground font-heading font-bold uppercase tracking-wide">Waiting for skipped users</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-0">
        {/* Left column — Pick Order */}
        <div className="border-b sm:border-b-0 sm:border-r border-border p-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Pick Order</h4>
          <ol className="space-y-1">
            {derby.derby_order.map((entry, index) => {
              const pick = derby.picks.find((p) => p.user_id === entry.user_id);
              const isCurrentTurn = index === derby.current_pick_index && !pick && !pastAllTurns;
              const isSkipped = skippedUsers.includes(entry.user_id) && !pick;
              const member = members.find((m) => m.user_id === entry.user_id);

              return (
                <li
                  key={entry.user_id}
                  className={`flex items-center justify-between py-1.5 px-2 rounded text-sm ${
                    isCurrentTurn
                      ? 'bg-primary/10 border border-primary/30'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 text-right text-xs font-medium text-disabled shrink-0">{index + 1}.</span>
                    <span className={`truncate ${
                      pick ? 'text-disabled' :
                      isCurrentTurn ? 'font-bold text-primary' :
                      'text-accent-foreground'
                    }`}>
                      {member?.display_name || entry.username}
                    </span>
                    {isCurrentTurn && (
                      <span className="shrink-0 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                        Picking
                      </span>
                    )}
                    {isSkipped && (
                      <span className="shrink-0 text-xs bg-warning text-warning-foreground px-1.5 py-0.5 rounded font-medium">
                        Skipped
                      </span>
                    )}
                  </div>
                  {pick && (
                    <span className="shrink-0 text-xs font-medium text-success-foreground">
                      Slot #{pick.selected_slot}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Right column — Slot Grid */}
        <div className="p-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Available Slots</h4>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {Array.from({ length: totalSlots }, (_, i) => i + 1).map((slot) => {
              const pick = derby.picks.find((p) => p.selected_slot === slot);
              const isTaken = !!pick;
              const slotClickable = !isTaken && canPick && !isSubmitting;
              const pickerMember = pick ? members.find((m) => m.user_id === pick.user_id) : null;

              return (
                <button
                  key={slot}
                  disabled={!slotClickable}
                  onClick={() => slotClickable && handleMakePick(slot)}
                  className={`relative rounded-lg border-2 p-2 text-center transition-all ${
                    isTaken
                      ? 'border-border bg-muted cursor-not-allowed'
                      : slotClickable
                        ? 'border-primary/30 bg-primary/10 hover:border-primary hover:bg-primary/20 cursor-pointer'
                        : 'border-border bg-background cursor-not-allowed opacity-60'
                  }`}
                >
                  <div className={`text-lg font-bold ${
                    isTaken ? 'text-disabled' :
                    slotClickable ? 'text-primary' :
                    'text-disabled'
                  }`}>{slot}</div>
                  {isTaken && (
                    <div className="text-xs text-muted-foreground truncate">
                      {pickerMember?.display_name || pickerMember?.username || 'Taken'}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer — error + commissioner controls */}
      {(pickError || (isCommissioner && currentPicker && !pastAllTurns)) && (
        <div className="border-t border-border px-4 py-3 flex items-center justify-between">
          {pickError && (
            <p className="text-xs text-destructive-foreground">{pickError}</p>
          )}
          {isCommissioner && currentPicker && !pastAllTurns && (
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => handleCommissionerAction(derby.timeout_action === 1 ? 'skip' : 'autopick')}
                disabled={isSubmitting}
                className="rounded-lg bg-muted-hover px-3 py-1.5 text-xs font-heading font-bold uppercase tracking-wide text-accent-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                {derby.timeout_action === 1 ? 'Skip User' : 'Autopick'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
