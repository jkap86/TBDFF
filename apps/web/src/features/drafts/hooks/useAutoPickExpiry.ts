import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { draftApi, ApiError, type Draft, type DraftPick } from '@/lib/api';
import { applyChainedPicksSequentially } from './useDraftSocket';

interface UseAutoPickExpiryParams {
  timeRemaining: number | null;
  autoPickTriggered: React.MutableRefObject<boolean>;
  clockOffsetRef: React.MutableRefObject<number>;
  draft: Draft | null;
  accessToken: string | null;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  setPicks: React.Dispatch<React.SetStateAction<DraftPick[]>>;
}

export function useAutoPickExpiry({
  timeRemaining,
  autoPickTriggered,
  clockOffsetRef,
  draft,
  accessToken,
  setDraft,
  setPicks,
}: UseAutoPickExpiryParams) {
  // Track an in-flight key per (draft, expiry-action) so reruns/remounts cannot
  // fire the same expiry action twice. Cleared when the action settles.
  const inFlightRef = useRef<Set<string>>(new Set());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (timeRemaining !== 0 || !draft || !accessToken || autoPickTriggered.current || draft.type === 'slow_auction') {
      return () => {
        cancelledRef.current = true;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    }

    const clockState = (draft.metadata?.clock_state as string | undefined) ?? 'running';
    if (clockState === 'paused' || clockState === 'stopped') return;

    const adjustedNow = Date.now() + clockOffsetRef.current;
    if (draft.type === 'auction') {
      const nom = draft.metadata?.current_nomination;
      const deadlineStr = nom?.bid_deadline ?? draft.metadata?.nomination_deadline;
      if (deadlineStr && new Date(deadlineStr).getTime() > adjustedNow + 1000) return;
    }

    autoPickTriggered.current = true;

    if (draft.type === 'auction') {
      const nomination = draft.metadata?.current_nomination;
      const key = `${draft.id}:auctionExpiry:${nomination?.bid_deadline ?? draft.metadata?.nomination_deadline ?? 'none'}`;
      if (inFlightRef.current.has(key)) {
        return () => {
          cancelledRef.current = true;
        };
      }
      inFlightRef.current.add(key);
      (async () => {
        try {
          if (nomination) {
            const result = await draftApi.resolve(draft.id, accessToken);
            if (cancelledRef.current) return;
            setDraft(result.draft);
            if (result.won) {
              setPicks((prev) => prev.map((p) => (p.id === result.won!.id ? result.won! : p)));
            }
          } else {
            const result = await draftApi.autoNominate(draft.id, accessToken);
            if (cancelledRef.current) return;
            setDraft(result.draft);
          }
        } catch (err) {
          try {
            const [draftResult, picksResult] = await Promise.all([
              draftApi.getById(draft.id, accessToken),
              draftApi.getPicks(draft.id, accessToken),
            ]);
            if (cancelledRef.current) return;
            setDraft(draftResult.draft);
            setPicks(picksResult.picks);
          } catch {
            // Socket/polling will catch up
          }
          if (err instanceof ApiError && !err.message.includes('already')) {
            toast.error(err.message);
          }
        } finally {
          inFlightRef.current.delete(key);
        }
      })();
    } else {
      const capturedLastPicked = draft.last_picked;
      const capturedDraftId = draft.id;
      const key = `${capturedDraftId}:autoPickExpiry:${capturedLastPicked ?? 'none'}`;
      if (inFlightRef.current.has(key)) {
        return () => {
          cancelledRef.current = true;
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        };
      }
      inFlightRef.current.add(key);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        if (cancelledRef.current) {
          inFlightRef.current.delete(key);
          return;
        }
        (async () => {
          try {
            const freshDraft = await draftApi.getById(capturedDraftId, accessToken!);
            if (cancelledRef.current) return;
            if (freshDraft.draft.last_picked !== capturedLastPicked) {
              setDraft(freshDraft.draft);
              const picksResult = await draftApi.getPicks(capturedDraftId, accessToken!);
              if (cancelledRef.current) return;
              setPicks(picksResult.picks);
              return;
            }
            const result = await draftApi.autoPick(capturedDraftId, accessToken!);
            if (cancelledRef.current) return;
            setPicks((prev) => prev.map((p) => (p.id === result.pick.id ? result.pick : p)));
            if (result.chained_picks?.length) {
              applyChainedPicksSequentially(setPicks, result.chained_picks);
            }
            const draftResult = await draftApi.getById(capturedDraftId, accessToken!);
            if (cancelledRef.current) return;
            setDraft(draftResult.draft);
          } catch (err) {
            if (err instanceof ApiError && !err.message.includes('already')) {
              toast.error(err.message);
            }
            try {
              const [draftResult, picksResult] = await Promise.all([
                draftApi.getById(capturedDraftId, accessToken!),
                draftApi.getPicks(capturedDraftId, accessToken!),
              ]);
              if (cancelledRef.current) return;
              setDraft(draftResult.draft);
              setPicks(picksResult.picks);
            } catch { /* socket/polling will catch up */ }
          } finally {
            inFlightRef.current.delete(key);
          }
        })();
      }, 3000);
    }

    return () => {
      cancelledRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [timeRemaining, draft, accessToken]);
}
