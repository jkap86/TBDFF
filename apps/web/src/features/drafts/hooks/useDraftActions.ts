import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { draftApi, ApiError, type Draft, type DraftPick, type DraftQueueItem, type Roster, type UpdateDraftRequest, type AuctionLot, type RosterBudget, type NominationStatsResponse } from '@/lib/api';
import { applyChainedPicksSequentially } from './useDraftSocket';

interface UseDraftActionsParams {
  draft: Draft | null;
  accessToken: string | null;
  rosters: Roster[];
  queue: DraftQueueItem[];
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  setPicks: React.Dispatch<React.SetStateAction<DraftPick[]>>;
  setQueue: React.Dispatch<React.SetStateAction<DraftQueueItem[]>>;
  setSlowAuctionLots: React.Dispatch<React.SetStateAction<AuctionLot[]>>;
  setSlowAuctionBudgets: React.Dispatch<React.SetStateAction<RosterBudget[]>>;
  setNominationStats: React.Dispatch<React.SetStateAction<NominationStatsResponse | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useDraftActions({
  draft,
  accessToken,
  rosters,
  queue,
  setDraft,
  setPicks,
  setQueue,
  setSlowAuctionLots,
  setSlowAuctionBudgets,
  setNominationStats,
  setError,
}: UseDraftActionsParams) {
  const [isPicking, setIsPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [isTogglingAutoPick, setIsTogglingAutoPick] = useState(false);

  // Auction-specific UI state
  const [nominatePlayerId, setNominatePlayerId] = useState('');
  const [nominateAmount, setNominateAmount] = useState(1);
  const [bidAmount, setBidAmount] = useState(0);
  const [isNominating, setIsNominating] = useState(false);
  const [isBidding, setIsBidding] = useState(false);

  const handleUpdateSettings = useCallback(async (updates: UpdateDraftRequest) => {
    if (!draft || !accessToken) return;
    const result = await draftApi.update(draft.id, updates, accessToken);
    setDraft(result.draft);
  }, [draft, accessToken]);

  const handleSetOrder = useCallback(async () => {
    if (!draft || !accessToken) return;

    try {
      const assignedRosters = rosters
        .filter((r) => r.owner_id)
        .sort((a, b) => a.roster_id - b.roster_id);

      const draftOrder: Record<string, number> = {};
      const slotToRosterId: Record<string, number> = {};

      assignedRosters.forEach((roster, index) => {
        const slot = index + 1;
        draftOrder[roster.owner_id!] = slot;
        slotToRosterId[String(slot)] = roster.roster_id;
      });

      const result = await draftApi.setOrder(draft.id, { draft_order: draftOrder, slot_to_roster_id: slotToRosterId }, accessToken);
      setDraft(result.draft);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    }
  }, [draft, accessToken, rosters]);

  const handleStartDraft = useCallback(async () => {
    if (!draft || !accessToken) return;

    try {
      const result = await draftApi.start(draft.id, accessToken);
      setDraft(result.draft);

      if (result.draft.type === 'slow_auction') {
        const [lotsResult, budgetsResult, picksResult] = await Promise.all([
          draftApi.getSlowAuctionLots(result.draft.id, accessToken),
          draftApi.getSlowAuctionBudgets(result.draft.id, accessToken),
          draftApi.getPicks(result.draft.id, accessToken),
        ]);
        setSlowAuctionLots(lotsResult.lots);
        setSlowAuctionBudgets(budgetsResult.budgets);
        setPicks(picksResult.picks);
      } else {
        const picksResult = await draftApi.getPicks(result.draft.id, accessToken);
        setPicks(picksResult.picks);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    }
  }, [draft, accessToken]);

  const handleMakePick = useCallback(async (playerId: string) => {
    if (!draft || !accessToken || !playerId.trim()) return;

    try {
      setIsPicking(true);
      setPickError(null);
      const result = await draftApi.makePick(draft.id, { player_id: playerId.trim() }, accessToken);
      setPicks((prev) => prev.map((p) => (p.id === result.pick.id ? result.pick : p)));
      if (result.chained_picks?.length) {
        applyChainedPicksSequentially(setPicks, result.chained_picks);
      }

      const draftResult = await draftApi.getById(draft.id, accessToken);
      setDraft(draftResult.draft);
    } catch (err) {
      if (err instanceof ApiError) {
        setPickError(err.message);
      } else {
        setPickError('Failed to make pick');
      }
    } finally {
      setIsPicking(false);
    }
  }, [draft, accessToken]);

  const handleNominate = useCallback(async (playerId?: string) => {
    const pid = playerId || nominatePlayerId;
    if (!draft || !accessToken || !pid.trim()) return;
    try {
      setIsNominating(true);
      setPickError(null);
      const result = await draftApi.nominate(draft.id, { player_id: pid.trim(), amount: nominateAmount }, accessToken);
      setDraft(result.draft);
      setNominatePlayerId('');
      setNominateAmount(1);
    } catch (err) {
      if (err instanceof ApiError) setPickError(err.message);
      else setPickError('Failed to nominate');
    } finally {
      setIsNominating(false);
    }
  }, [draft, accessToken, nominatePlayerId, nominateAmount]);

  const handleBid = useCallback(async (amount?: number) => {
    if (!draft || !accessToken) return;
    const bidAmt = amount ?? bidAmount;
    if (bidAmt < 1) return;
    try {
      setIsBidding(true);
      setPickError(null);
      const result = await draftApi.bid(draft.id, { amount: bidAmt }, accessToken);
      setDraft(result.draft);
      if (result.won) {
        setPicks((prev) => prev.map((p) => (p.id === result.won!.id ? result.won! : p)));
      }
      setBidAmount(0);
    } catch (err) {
      if (err instanceof ApiError) setPickError(err.message);
      else setPickError('Failed to place bid');
    } finally {
      setIsBidding(false);
    }
  }, [draft, accessToken, bidAmount]);

  const handleSlowNominate = useCallback(async (playerId?: string) => {
    const pid = playerId || nominatePlayerId;
    if (!draft || !accessToken || !pid.trim()) return;
    try {
      setIsNominating(true);
      setPickError(null);
      const result = await draftApi.slowNominate(draft.id, { player_id: pid.trim() }, accessToken);
      setSlowAuctionLots((prev) => {
        const existing = prev.find((l) => l.id === result.lot.id);
        if (existing) return prev.map((l) => (l.id === result.lot.id ? result.lot : l));
        return [...prev, result.lot];
      });
      setNominatePlayerId('');
      const statsResult = await draftApi.getNominationStats(draft.id, accessToken);
      setNominationStats(statsResult);
    } catch (err) {
      if (err instanceof ApiError) setPickError(err.message);
      else setPickError('Failed to nominate');
    } finally {
      setIsNominating(false);
    }
  }, [draft, accessToken, nominatePlayerId]);

  const handleSlowSetMaxBid = useCallback(async (lotId: string, maxBid: number) => {
    if (!draft || !accessToken) return;
    try {
      const result = await draftApi.slowSetMaxBid(draft.id, lotId, { max_bid: maxBid }, accessToken);
      setSlowAuctionLots((prev) => prev.map((l) => (l.id === result.lot.id ? result.lot : l)));
      const lotsResult = await draftApi.getSlowAuctionLots(draft.id, accessToken);
      setSlowAuctionLots(lotsResult.lots);
      const budgetsResult = await draftApi.getSlowAuctionBudgets(draft.id, accessToken);
      setSlowAuctionBudgets(budgetsResult.budgets);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new Error('Failed to place bid');
    }
  }, [draft, accessToken]);

  const handleReorderQueue = useCallback(async (playerIds: string[]) => {
    if (!draft || !accessToken) return;
    try {
      const result = await draftApi.setQueue(draft.id, { player_ids: playerIds }, accessToken);
      setQueue(result.queue);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reorder queue');
    }
  }, [draft, accessToken]);

  const handleRemoveFromQueue = useCallback(async (playerId: string) => {
    if (!draft || !accessToken) return;
    try {
      const result = await draftApi.removeFromQueue(draft.id, playerId, accessToken);
      setQueue(result.queue);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove from queue');
    }
  }, [draft, accessToken]);

  const handleAddToQueue = useCallback(async (playerId: string) => {
    if (!draft || !accessToken) return;
    try {
      const result = await draftApi.addToQueue(draft.id, { player_id: playerId }, accessToken);
      setQueue(result.queue);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add to queue');
    }
  }, [draft, accessToken]);

  const handleUpdateMaxBid = useCallback(async (playerId: string, maxBid: number | null) => {
    if (!draft || !accessToken) return;
    try {
      const result = await draftApi.updateQueueMaxBid(draft.id, playerId, { max_bid: maxBid }, accessToken);
      setQueue(result.queue);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update max bid');
    }
  }, [draft, accessToken]);

  const handleNominationMaxBid = useCallback(async (playerId: string, maxBid: number | null) => {
    if (!draft || !accessToken) return;
    const inQueue = queue.some((q) => q.player_id === playerId);
    try {
      if (inQueue) {
        const result = await draftApi.updateQueueMaxBid(draft.id, playerId, { max_bid: maxBid }, accessToken);
        setQueue(result.queue);
      } else {
        const result = await draftApi.addToQueue(draft.id, { player_id: playerId, max_bid: maxBid }, accessToken);
        setQueue(result.queue);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update auto-bid');
    }
  }, [draft, accessToken, queue]);

  const handleToggleAutoPick = useCallback(async () => {
    if (!draft || !accessToken) return;

    try {
      setIsTogglingAutoPick(true);
      setPickError(null);
      const result = await draftApi.toggleAutoPick(draft.id, accessToken);
      setDraft(result.draft);

      if (result.picks.length > 0) {
        applyChainedPicksSequentially(setPicks, result.picks);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setPickError(err.message);
      }
    } finally {
      setIsTogglingAutoPick(false);
    }
  }, [draft, accessToken]);

  const handlePauseDraft = useCallback(async () => {
    if (!draft || !accessToken) return;
    try {
      const result = await draftApi.pause(draft.id, accessToken);
      setDraft(result.draft);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    }
  }, [draft, accessToken]);

  const handleStopDraft = useCallback(async () => {
    if (!draft || !accessToken) return;
    try {
      const result = await draftApi.stop(draft.id, accessToken);
      setDraft(result.draft);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    }
  }, [draft, accessToken]);

  const handleUpdateTimers = useCallback(async (timers: Record<string, number>) => {
    if (!draft || !accessToken) return;
    try {
      const result = await draftApi.updateTimers(draft.id, timers, accessToken);
      setDraft(result.draft);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    }
  }, [draft, accessToken]);

  return {
    // UI state
    isPicking,
    pickError,
    isTogglingAutoPick,
    nominatePlayerId,
    setNominatePlayerId,
    nominateAmount,
    setNominateAmount,
    bidAmount,
    setBidAmount,
    isNominating,
    isBidding,

    // Handlers
    handleUpdateSettings,
    handleSetOrder,
    handleStartDraft,
    handleMakePick,
    handleNominate,
    handleBid,
    handleSlowNominate,
    handleSlowSetMaxBid,
    handleReorderQueue,
    handleRemoveFromQueue,
    handleAddToQueue,
    handleUpdateMaxBid,
    handleNominationMaxBid,
    handleToggleAutoPick,
    handlePauseDraft,
    handleStopDraft,
    handleUpdateTimers,
  };
}
