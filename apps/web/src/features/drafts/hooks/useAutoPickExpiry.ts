import { useEffect } from 'react';
import { toast } from 'sonner';
import { draftApi, ApiError, type Draft, type DraftPick } from '@/lib/api';
import { applyChainedPicks } from './useDraftSocket';

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
  useEffect(() => {
    if (timeRemaining !== 0 || !draft || !accessToken || autoPickTriggered.current || draft.type === 'slow_auction') return;

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
      (async () => {
        try {
          if (nomination) {
            const result = await draftApi.resolve(draft.id, accessToken);
            setDraft(result.draft);
            if (result.won) {
              setPicks((prev) => prev.map((p) => (p.id === result.won!.id ? result.won! : p)));
            }
          } else {
            const result = await draftApi.autoNominate(draft.id, accessToken);
            setDraft(result.draft);
          }
        } catch (err) {
          try {
            const [draftResult, picksResult] = await Promise.all([
              draftApi.getById(draft.id, accessToken),
              draftApi.getPicks(draft.id, accessToken),
            ]);
            setDraft(draftResult.draft);
            setPicks(picksResult.picks);
          } catch {
            // Socket/polling will catch up
          }
          if (err instanceof ApiError && !err.message.includes('already')) {
            toast.error(err.message);
          }
        }
      })();
    } else {
      const capturedLastPicked = draft.last_picked;
      const capturedDraftId = draft.id;
      setTimeout(() => {
        (async () => {
          try {
            const freshDraft = await draftApi.getById(capturedDraftId, accessToken!);
            if (freshDraft.draft.last_picked !== capturedLastPicked) {
              setDraft(freshDraft.draft);
              const picksResult = await draftApi.getPicks(capturedDraftId, accessToken!);
              setPicks(picksResult.picks);
              return;
            }
            const result = await draftApi.autoPick(capturedDraftId, accessToken!);
            setPicks((prev) => {
              let updated = prev.map((p) => (p.id === result.pick.id ? result.pick : p));
              if (result.chained_picks?.length) {
                updated = applyChainedPicks(updated, result.chained_picks);
              }
              return updated;
            });
            const draftResult = await draftApi.getById(capturedDraftId, accessToken!);
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
              setDraft(draftResult.draft);
              setPicks(picksResult.picks);
            } catch { /* socket/polling will catch up */ }
          }
        })();
      }, 3000);
    }
  }, [timeRemaining, draft, accessToken]);
}
