import { useState, useEffect, useRef, useCallback } from 'react';
import type { Draft } from '@/lib/api';

export function useDraftTimer(draft: Draft | null) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const autoPickTriggered = useRef(false);
  /** Approximate difference (ms) between server clock and client clock: serverMs - clientMs */
  const clockOffsetRef = useRef(0);

  /** Call this whenever a server timestamp is received to keep the clock in sync */
  const updateClockOffset = useCallback((serverUpdatedAt: string) => {
    const serverTs = new Date(serverUpdatedAt).getTime();
    if (!isNaN(serverTs)) {
      clockOffsetRef.current = serverTs - Date.now();
    }
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!draft || draft.status !== 'drafting') {
      setTimeRemaining(null);
      return;
    }

    let deadline: number | null = null;

    if (draft.type === 'auction') {
      const nomination = draft.metadata?.current_nomination;
      if (nomination?.bid_deadline) {
        deadline = new Date(nomination.bid_deadline).getTime();
      } else if (draft.metadata?.nomination_deadline) {
        deadline = new Date(draft.metadata.nomination_deadline).getTime();
      }
    } else {
      if (!draft.settings.pick_timer) { setTimeRemaining(null); return; }
      const referenceTime = draft.last_picked || draft.start_time;
      if (!referenceTime) { setTimeRemaining(null); return; }
      deadline = new Date(referenceTime).getTime() + draft.settings.pick_timer * 1000;
    }

    if (!deadline) { setTimeRemaining(null); return; }

    // Reset autoPickTriggered whenever the timer effect re-runs (dependencies changed
    // = new pick cycle). The server validates timer expiry server-side, so spurious
    // client-side triggers are harmlessly rejected.
    autoPickTriggered.current = false;

    const clientNow = () => Date.now() + clockOffsetRef.current;

    const tickInterval = draft.type === 'auction' ? 250 : 1000;
    const tick = () => {
      // Apply clock offset so timer stays in sync with the server clock
      const remaining = Math.max(0, Math.ceil((deadline! - clientNow()) / 1000));
      setTimeRemaining(remaining);
    };

    tick();
    const interval = setInterval(tick, tickInterval);
    return () => clearInterval(interval);
  }, [draft?.status, draft?.type, draft?.last_picked, draft?.start_time, draft?.settings?.pick_timer, draft?.metadata?.current_nomination?.bid_deadline, draft?.metadata?.nomination_deadline]);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  return {
    timeRemaining,
    formatTime,
    autoPickTriggered,
    clockOffsetRef,
    updateClockOffset,
  };
}
