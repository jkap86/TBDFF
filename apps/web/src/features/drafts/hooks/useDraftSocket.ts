import { useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { draftApi, type Draft, type DraftPick, type AuctionLot, type RosterBudget, type NominationStatsResponse } from '@/lib/api';

export function applyChainedPicks(prev: DraftPick[], chainedPicks: DraftPick[]): DraftPick[] {
  let updated = prev;
  for (const cp of chainedPicks) {
    updated = updated.map((p) => (p.id === cp.id ? cp : p));
  }
  return updated;
}

interface UseDraftSocketParams {
  socket: any;
  draft: Draft | null;
  accessToken: string | null;
  updateClockOffset: (serverTime: string) => void;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  setPicks: React.Dispatch<React.SetStateAction<DraftPick[]>>;
  setQueue: React.Dispatch<React.SetStateAction<any[]>>;
  setSlowAuctionLots: React.Dispatch<React.SetStateAction<AuctionLot[]>>;
  setSlowAuctionBudgets: React.Dispatch<React.SetStateAction<RosterBudget[]>>;
  setNominationStats: React.Dispatch<React.SetStateAction<NominationStatsResponse | null>>;
}

export function useDraftSocket({
  socket,
  draft,
  accessToken,
  updateClockOffset,
  setDraft,
  setPicks,
  setQueue,
  setSlowAuctionLots,
  setSlowAuctionBudgets,
  setNominationStats,
}: UseDraftSocketParams) {
  // Helper to refresh slow auction data
  const refreshSlowAuctionData = useCallback(async () => {
    if (!draft || !accessToken || draft.type !== 'slow_auction') return;
    try {
      const [budgetsResult, statsResult, picksResult] = await Promise.all([
        draftApi.getSlowAuctionBudgets(draft.id, accessToken),
        draftApi.getNominationStats(draft.id, accessToken),
        draftApi.getPicks(draft.id, accessToken),
      ]);
      setSlowAuctionBudgets(budgetsResult.budgets);
      setNominationStats(statsResult);
      setPicks(picksResult.picks);
    } catch {
      // Non-critical
    }
  }, [draft?.id, draft?.type, accessToken]);

  // Subscribe to real-time draft updates via socket
  useEffect(() => {
    if (!socket || !draft?.id || draft.status !== 'drafting') return;

    socket.emit('draft:join', draft.id);

    const handleStateUpdate = (data: { draft: Draft; pick?: DraftPick; chained_picks?: DraftPick[]; server_time?: string }) => {
      setDraft(data.draft);
      if (data.server_time) updateClockOffset(data.server_time);
      if (data.pick || data.chained_picks?.length) {
        setPicks((prev) => {
          let updated = prev;
          if (data.pick) {
            updated = updated.map((p) => (p.id === data.pick!.id ? data.pick! : p));
          }
          if (data.chained_picks?.length) {
            updated = applyChainedPicks(updated, data.chained_picks);
          }
          return updated;
        });
        if (accessToken) {
          draftApi.getQueue(draft.id, accessToken).then((res) => setQueue(res.queue)).catch(() => {});
        }
      }
    };

    socket.on('draft:state_updated', handleStateUpdate);

    // Slow auction socket events
    const handleLotCreated = (data: { lot: AuctionLot }) => {
      setSlowAuctionLots((prev) => {
        const existing = prev.find((l) => l.id === data.lot.id);
        if (existing) return prev.map((l) => (l.id === data.lot.id ? data.lot : l));
        return [...prev, data.lot];
      });
      refreshSlowAuctionData();
    };

    const handleLotUpdated = (data: { lot: AuctionLot }) => {
      setSlowAuctionLots((prev) => prev.map((l) => (l.id === data.lot.id ? { ...data.lot, my_max_bid: l.my_max_bid } : l)));
    };

    const handleLotWon = (data: { lot: AuctionLot }) => {
      setSlowAuctionLots((prev) => prev.filter((l) => l.id !== data.lot.id));
      refreshSlowAuctionData();
    };

    const handleLotPassed = (data: { lot: AuctionLot }) => {
      setSlowAuctionLots((prev) => prev.filter((l) => l.id !== data.lot.id));
      refreshSlowAuctionData();
    };

    const handleOutbid = (data: { lot_id: string; player_id: string; player_name?: string; new_bid: number }) => {
      toast.error(`You've been outbid on ${data.player_name || data.player_id}! New bid: $${data.new_bid}`);
      if (accessToken && draft.id) {
        draftApi.getSlowAuctionLots(draft.id, accessToken).then((res) => setSlowAuctionLots(res.lots)).catch(() => {});
      }
    };

    if (draft.type === 'slow_auction') {
      socket.on('slow_auction:lot_created', handleLotCreated);
      socket.on('slow_auction:lot_updated', handleLotUpdated);
      socket.on('slow_auction:lot_won', handleLotWon);
      socket.on('slow_auction:lot_passed', handleLotPassed);
      socket.on('slow_auction:outbid', handleOutbid);
    }

    return () => {
      socket.off('draft:state_updated', handleStateUpdate);
      if (draft.type === 'slow_auction') {
        socket.off('slow_auction:lot_created', handleLotCreated);
        socket.off('slow_auction:lot_updated', handleLotUpdated);
        socket.off('slow_auction:lot_won', handleLotWon);
        socket.off('slow_auction:lot_passed', handleLotPassed);
        socket.off('slow_auction:outbid', handleOutbid);
      }
      socket.emit('draft:leave', draft.id);
    };
  }, [socket, draft?.id, draft?.status, draft?.type, accessToken, updateClockOffset]);

  return { refreshSlowAuctionData };
}
