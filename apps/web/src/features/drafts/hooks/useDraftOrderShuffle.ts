'use client';

import { useState, useRef, useEffect } from 'react';
import { draftApi, ApiError } from '@/lib/api';
import type { Draft, Roster } from '@tbdff/shared';

interface ShuffleDisplay {
  draftId: string;
  lockedCount: number;
  displayRosterIds: number[];
}

interface UseDraftOrderShuffleParams {
  rosters: Roster[];
  accessToken: string | null;
  updateDraftsCache: (updater: (prev: Draft[]) => Draft[]) => void;
  setMutationError: (err: string | null) => void;
}

export function useDraftOrderShuffle({
  rosters,
  accessToken,
  updateDraftsCache,
  setMutationError,
}: UseDraftOrderShuffleParams) {
  const [shuffleDisplay, setShuffleDisplay] = useState<ShuffleDisplay | null>(null);
  const shuffleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (shuffleIntervalRef.current) clearInterval(shuffleIntervalRef.current);
    };
  }, []);

  const handleRandomizeDraftOrder = async (draft: Draft) => {
    if (!accessToken) return;

    try {
      const allRosters = [...rosters];

      // Fisher-Yates shuffle
      for (let i = allRosters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allRosters[i], allRosters[j]] = [allRosters[j], allRosters[i]];
      }

      const draftOrder: Record<string, number> = {};
      const slotToRosterId: Record<string, number> = {};

      allRosters.forEach((roster, index) => {
        const slot = index + 1;
        slotToRosterId[String(slot)] = roster.roster_id;
        if (roster.owner_id) {
          draftOrder[roster.owner_id] = slot;
        }
      });

      const result = await draftApi.setOrder(draft.id, { draft_order: draftOrder, slot_to_roster_id: slotToRosterId }, accessToken);
      updateDraftsCache((prev) => prev.map((d) => (d.id === result.draft.id ? result.draft : d)));

      // Start shuffle animation using slot_to_roster_id (includes all rosters)
      const finalRosterIds = Object.entries(result.draft.slot_to_roster_id)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, rid]) => rid);
      const totalSlots = finalRosterIds.length;

      if (shuffleIntervalRef.current) clearInterval(shuffleIntervalRef.current);
      let tickCount = 0;
      const initialTicks = 12;
      const ticksPerLock = 13;

      shuffleIntervalRef.current = setInterval(() => {
        tickCount++;

        let newLockedCount = 0;
        if (tickCount > initialTicks) {
          newLockedCount = Math.min(
            Math.floor((tickCount - initialTicks) / ticksPerLock) + 1,
            totalSlots
          );
        }

        const lockedPart = finalRosterIds.slice(0, newLockedCount);
        const unlocked = finalRosterIds.filter((rid) => !lockedPart.includes(rid));

        for (let i = unlocked.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [unlocked[i], unlocked[j]] = [unlocked[j], unlocked[i]];
        }

        setShuffleDisplay({ draftId: draft.id, lockedCount: newLockedCount, displayRosterIds: [...lockedPart, ...unlocked] });

        if (newLockedCount >= totalSlots) {
          clearInterval(shuffleIntervalRef.current!);
          shuffleIntervalRef.current = null;
          setShuffleDisplay(null);
        }
      }, 80);
    } catch (err) {
      if (err instanceof ApiError) {
        setMutationError(err.message);
      }
    }
  };

  return { shuffleDisplay, handleRandomizeDraftOrder };
}
