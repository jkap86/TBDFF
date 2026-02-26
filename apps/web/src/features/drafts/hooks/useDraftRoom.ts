import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { draftApi, leagueApi, ApiError, type Draft, type DraftPick, type DraftQueueItem, type LeagueMember, type Roster, type UpdateDraftRequest } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useSocket } from '@/features/chat/context/SocketProvider';
import { useDraftTimer } from './useDraftTimer';

function applyChainedPicks(prev: DraftPick[], chainedPicks: DraftPick[]): DraftPick[] {
  let updated = prev;
  for (const cp of chainedPicks) {
    updated = updated.map((p) => (p.id === cp.id ? cp : p));
  }
  return updated;
}

export function useDraftRoom(leagueId: string) {
  const { accessToken, user } = useAuth();
  const { socket } = useSocket();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickPlayerId, setPickPlayerId] = useState('');
  const [isPicking, setIsPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [isTogglingAutoPick, setIsTogglingAutoPick] = useState(false);

  // Queue state
  const [queue, setQueue] = useState<DraftQueueItem[]>([]);
  const [sidebarTab, setSidebarTab] = useState<'queue' | 'players'>('players');

  // Auction-specific state
  const [nominatePlayerId, setNominatePlayerId] = useState('');
  const [nominateAmount, setNominateAmount] = useState(1);
  const [bidAmount, setBidAmount] = useState(0);
  const [isNominating, setIsNominating] = useState(false);
  const [isBidding, setIsBidding] = useState(false);

  const timer = useDraftTimer(draft);

  const fetchDraftData = useCallback(async () => {
    if (!accessToken) return;

    try {
      // First get the league's drafts to find the active one, falling back to the most recent completed draft
      const draftsResult = await draftApi.getByLeague(leagueId, accessToken);
      const activeDraft = draftsResult.drafts.find(
        (d: Draft) => d.status === 'pre_draft' || d.status === 'drafting'
      ) ?? draftsResult.drafts.find((d: Draft) => d.status === 'complete');

      if (!activeDraft) {
        setError('No active draft found');
        setIsLoading(false);
        return;
      }

      const [draftResult, membersResult, rostersResult] = await Promise.all([
        draftApi.getById(activeDraft.id, accessToken),
        leagueApi.getMembers(leagueId, accessToken),
        leagueApi.getRosters(leagueId, accessToken),
      ]);

      setDraft(draftResult.draft);
      setMembers(membersResult.members);
      setRosters(rostersResult.rosters);

      // Compute clock offset from server's updated_at timestamp so the timer stays in sync
      timer.updateClockOffset(draftResult.draft.updated_at);

      // Fetch picks if the draft has started or is complete
      if (draftResult.draft.status === 'drafting' || draftResult.draft.status === 'complete') {
        const picksResult = await draftApi.getPicks(activeDraft.id, accessToken);
        setPicks(picksResult.picks);
      }

      // Fetch queue if draft is not complete
      if (draftResult.draft.status !== 'complete') {
        try {
          const queueResult = await draftApi.getQueue(activeDraft.id, accessToken);
          setQueue(queueResult.queue);
        } catch {
          // Queue fetch is non-critical
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load draft');
      }
    } finally {
      setIsLoading(false);
    }
  }, [leagueId, accessToken, timer.updateClockOffset]);

  useEffect(() => {
    fetchDraftData();
  }, [fetchDraftData]);

  // Subscribe to real-time draft updates via socket
  useEffect(() => {
    if (!socket || !draft?.id || draft.status !== 'drafting') return;

    socket.emit('draft:join', draft.id);

    const handleStateUpdate = (data: { draft: Draft; pick?: DraftPick; chained_picks?: DraftPick[] }) => {
      setDraft(data.draft);
      // Update clock offset whenever we get a server timestamp
      timer.updateClockOffset(data.draft.updated_at);
      if (data.pick) {
        setPicks((prev) => {
          let updated = prev.map((p) => (p.id === data.pick!.id ? data.pick! : p));
          if (data.chained_picks?.length) {
            updated = applyChainedPicks(updated, data.chained_picks);
          }
          return updated;
        });
        // Refresh queue so drafted players are immediately reflected
        if (accessToken) {
          draftApi.getQueue(draft.id, accessToken).then((res) => setQueue(res.queue)).catch(() => {});
        }
      }
    };

    socket.on('draft:state_updated', handleStateUpdate);

    return () => {
      socket.off('draft:state_updated', handleStateUpdate);
      socket.emit('draft:leave', draft.id);
    };
  }, [socket, draft?.id, draft?.status, accessToken, timer.updateClockOffset]);

  // Fallback polling (reduced frequency since socket handles real-time updates)
  useEffect(() => {
    if (!draft || draft.status !== 'drafting' || !accessToken) return;

    const interval = setInterval(async () => {
      try {
        const [draftResult, picksResult] = await Promise.all([
          draftApi.getById(draft.id, accessToken),
          draftApi.getPicks(draft.id, accessToken),
        ]);
        setDraft(draftResult.draft);
        setPicks(picksResult.picks);
      } catch {
        // Silently ignore polling errors — socket handles primary updates
      }
    }, 10000); // 10s fallback (down from 2-5s) since socket delivers real-time updates

    return () => clearInterval(interval);
  }, [draft?.id, draft?.status, accessToken]);

  // Auto-pick / auction resolve when timer expires
  useEffect(() => {
    if (timer.timeRemaining !== 0 || !draft || !accessToken || timer.autoPickTriggered.current) return;

    // For auction drafts, verify the actual deadline has passed before acting.
    // Guards against stale timeRemaining=0 racing with a newly created nomination.
    const adjustedNow = Date.now() + timer.clockOffsetRef.current;
    if (draft.type === 'auction') {
      const nom = draft.metadata?.current_nomination;
      const deadlineStr = nom?.bid_deadline ?? draft.metadata?.nomination_deadline;
      if (deadlineStr && new Date(deadlineStr).getTime() > adjustedNow + 1000) return;
    }

    timer.autoPickTriggered.current = true;

    if (draft.type === 'auction') {
      const nomination = draft.metadata?.current_nomination;
      (async () => {
        try {
          if (nomination) {
            // Bidding timer expired — resolve nomination
            const result = await draftApi.resolve(draft.id, accessToken);
            setDraft(result.draft);
            if (result.won) {
              setPicks((prev) => prev.map((p) => (p.id === result.won!.id ? result.won! : p)));
            }
          } else {
            // Nomination timer expired — auto-nominate
            const result = await draftApi.autoNominate(draft.id, accessToken);
            setDraft(result.draft);
          }
        } catch (err) {
          // Another client already resolved — refresh immediately (this is expected, not an error)
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
          // Only show a toast for unexpected errors, not for benign "already resolved" conflicts
          if (err instanceof ApiError && !err.message.includes('already')) {
            toast.error(err.message);
          }
        }
      })();
    } else {
      (async () => {
        try {
          const result = await draftApi.autoPick(draft.id, accessToken);
          setPicks((prev) => {
            let updated = prev.map((p) => (p.id === result.pick.id ? result.pick : p));
            if (result.chained_picks?.length) {
              updated = applyChainedPicks(updated, result.chained_picks);
            }
            return updated;
          });
          const draftResult = await draftApi.getById(draft.id, accessToken);
          setDraft(draftResult.draft);
        } catch (err) {
          // Another client may have already triggered auto-pick; this is expected
          if (err instanceof ApiError && !err.message.includes('already')) {
            toast.error(err.message);
          }
        }
      })();
    }
  }, [timer.timeRemaining, draft, accessToken]);

  const handleUpdateSettings = useCallback(async (updates: UpdateDraftRequest) => {
    if (!draft || !accessToken) return;
    const result = await draftApi.update(draft.id, updates, accessToken);
    setDraft(result.draft);
  }, [draft, accessToken]);

  const handleSetOrder = useCallback(async () => {
    if (!draft || !accessToken) return;

    try {
      // Auto-generate order: assign slots based on roster assignments
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
      // Fetch picks after starting
      const picksResult = await draftApi.getPicks(result.draft.id, accessToken);
      setPicks(picksResult.picks);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    }
  }, [draft, accessToken]);

  const handleMakePick = useCallback(async () => {
    if (!draft || !accessToken || !pickPlayerId.trim()) return;

    try {
      setIsPicking(true);
      setPickError(null);
      const result = await draftApi.makePick(draft.id, { player_id: pickPlayerId.trim() }, accessToken);
      setPicks((prev) => {
        let updated = prev.map((p) => (p.id === result.pick.id ? result.pick : p));
        if (result.chained_picks?.length) {
          updated = applyChainedPicks(updated, result.chained_picks);
        }
        return updated;
      });
      setPickPlayerId('');

      // Refresh draft state
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
  }, [draft, accessToken, pickPlayerId]);

  // Auction handlers
  const handleNominate = useCallback(async () => {
    if (!draft || !accessToken || !nominatePlayerId.trim()) return;
    try {
      setIsNominating(true);
      setPickError(null);
      const result = await draftApi.nominate(draft.id, { player_id: nominatePlayerId.trim(), amount: nominateAmount }, accessToken);
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

  // Queue handlers
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

      // Apply any chained picks that were made
      if (result.picks.length > 0) {
        setPicks((prev) => applyChainedPicks(prev, result.picks));
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setPickError(err.message);
      }
    } finally {
      setIsTogglingAutoPick(false);
    }
  }, [draft, accessToken]);

  // Derived state
  const isAuction = draft?.type === 'auction';
  const autoPickUsers: string[] = draft?.metadata?.auto_pick_users ?? [];
  const isAutoPick = user?.id ? autoPickUsers.includes(user.id) : false;
  const draftedPlayerIds = new Set(picks.filter((p) => p.player_id).map((p) => p.player_id!));
  const nextPick = picks.find((p) => !p.player_id);
  const userSlot = user?.id && draft?.draft_order ? draft.draft_order[user.id] : undefined;
  const userRosterId = rosters.find(r => r.owner_id === user?.id)?.roster_id;
  const isMyTurn = nextPick && userRosterId !== undefined && nextPick.roster_id === userRosterId;
  const currentMember = members.find((m) => m.user_id === user?.id);
  const isCommissioner = currentMember?.role === 'commissioner';

  return {
    // Core state
    draft,
    picks,
    members,
    rosters,
    queue,
    isLoading,
    error,
    user,
    accessToken,

    // UI state
    pickPlayerId,
    setPickPlayerId,
    isPicking,
    pickError,
    isTogglingAutoPick,
    sidebarTab,
    setSidebarTab,

    // Auction UI state
    nominatePlayerId,
    setNominatePlayerId,
    nominateAmount,
    setNominateAmount,
    bidAmount,
    setBidAmount,
    isNominating,
    isBidding,

    // Timer
    timeRemaining: timer.timeRemaining,
    formatTime: timer.formatTime,

    // Derived state
    isAuction,
    isAutoPick,
    draftedPlayerIds,
    nextPick,
    userSlot,
    isMyTurn,
    isCommissioner,

    // Handlers
    handleUpdateSettings,
    handleSetOrder,
    handleStartDraft,
    handleMakePick,
    handleNominate,
    handleBid,
    handleReorderQueue,
    handleRemoveFromQueue,
    handleAddToQueue,
    handleUpdateMaxBid,
    handleNominationMaxBid,
    handleToggleAutoPick,
  };
}
