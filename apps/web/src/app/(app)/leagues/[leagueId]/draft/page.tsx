'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { draftApi, leagueApi, ApiError, type Draft, type DraftPick, type DraftQueueItem, type LeagueMember, type Roster, type UpdateDraftRequest } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { DraftBoard } from '@/features/drafts/components/DraftBoard';
import { AuctionBoard } from '@/features/drafts/components/AuctionBoard';
import { DraftSettingsForm } from '@/features/drafts/components/DraftSettingsForm';
import { DraftQueue } from '@/features/drafts/components/DraftQueue';

const draftTypeLabels: Record<string, string> = {
  snake: 'Snake',
  linear: 'Linear',
  '3rr': '3rd Round Reversal',
  auction: 'Auction',
};

function applyChainedPicks(prev: DraftPick[], chainedPicks: DraftPick[]): DraftPick[] {
  let updated = prev;
  for (const cp of chainedPicks) {
    updated = updated.map((p) => (p.id === cp.id ? cp : p));
  }
  return updated;
}

function NominationMaxBid({ nomination, queue, budget, onUpdateMaxBid }: {
  nomination: { player_id: string; player_metadata?: { auction_value?: number | null } };
  queue: DraftQueueItem[];
  budget: number;
  onUpdateMaxBid: (playerId: string, maxBid: number | null) => void;
}) {
  const queueItem = queue.find((q) => q.player_id === nomination.player_id);
  const currentMaxBid = queueItem?.max_bid ?? null;
  const aav = nomination.player_metadata?.auction_value ?? queueItem?.auction_value ?? null;
  const defaultBid = aav != null ? Math.floor(aav * 0.8 * (budget / 200)) : null;

  const [value, setValue] = useState(currentMaxBid != null ? String(currentMaxBid) : '');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setValue(currentMaxBid != null ? String(currentMaxBid) : '');
    }
  }, [currentMaxBid, isFocused]);

  const commit = () => {
    setIsFocused(false);
    const trimmed = value.trim();
    if (trimmed === '') {
      if (currentMaxBid != null) onUpdateMaxBid(nomination.player_id, null);
      return;
    }
    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num < 0) {
      setValue(currentMaxBid != null ? String(currentMaxBid) : '');
      return;
    }
    if (num !== currentMaxBid) {
      onUpdateMaxBid(nomination.player_id, num);
    }
  };

  return (
    <div className="flex items-center gap-1 border-l border-gray-200 pl-2 ml-1">
      <span className="text-xs text-gray-500 whitespace-nowrap">Auto-bid up to</span>
      <span className="text-xs text-gray-400">$</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={() => setIsFocused(true)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder={defaultBid != null ? String(defaultBid) : '—'}
        title={defaultBid != null ? `Default: $${defaultBid} (80% of AAV $${aav})` : 'Set max auto-bid'}
        className="w-14 rounded border border-gray-200 px-1 py-1 text-center text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

export default function DraftRoomPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;
  const { accessToken, user } = useAuth();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickPlayerId, setPickPlayerId] = useState('');
  const [isPicking, setIsPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isTogglingAutoPick, setIsTogglingAutoPick] = useState(false);
  const autoPickTriggered = useRef(false);

  // Queue state
  const [queue, setQueue] = useState<DraftQueueItem[]>([]);

  // Auction-specific state
  const [nominatePlayerId, setNominatePlayerId] = useState('');
  const [nominateAmount, setNominateAmount] = useState(1);
  const [bidAmount, setBidAmount] = useState(0);
  const [isNominating, setIsNominating] = useState(false);
  const [isBidding, setIsBidding] = useState(false);
  const isAuction = draft?.type === 'auction';

  // Derive autopick status from draft metadata
  const autoPickUsers: string[] = draft?.metadata?.auto_pick_users ?? [];
  const isAutoPick = user?.id ? autoPickUsers.includes(user.id) : false;

  const fetchDraftData = useCallback(async () => {
    if (!accessToken) return;

    try {
      // First get the league's drafts to find the active one
      const draftsResult = await draftApi.getByLeague(leagueId, accessToken);
      const activeDraft = draftsResult.drafts.find(
        (d: Draft) => d.status === 'pre_draft' || d.status === 'drafting'
      );

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

      // Only fetch picks if the draft has started
      if (draftResult.draft.status === 'drafting') {
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
  }, [leagueId, accessToken]);

  useEffect(() => {
    fetchDraftData();
  }, [fetchDraftData]);

  // Poll for updates when drafting
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
        // Silently ignore polling errors
      }
    }, draft.type === 'auction' ? 2000 : 5000);

    return () => clearInterval(interval);
  }, [draft, accessToken]);

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

    // Only reset autoPickTriggered when the deadline is actually in the future.
    // This prevents a race where stale timeRemaining=0 triggers resolve on a new nomination.
    if (deadline > Date.now()) {
      autoPickTriggered.current = false;
    }

    const tickInterval = draft.type === 'auction' ? 250 : 1000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline! - Date.now()) / 1000));
      setTimeRemaining(remaining);
    };

    tick();
    const interval = setInterval(tick, tickInterval);
    return () => clearInterval(interval);
  }, [draft?.status, draft?.type, draft?.last_picked, draft?.start_time, draft?.settings?.pick_timer, draft?.metadata?.current_nomination?.bid_deadline, draft?.metadata?.nomination_deadline]);

  // Auto-pick / auction resolve when timer expires
  useEffect(() => {
    if (timeRemaining !== 0 || !draft || !accessToken || autoPickTriggered.current) return;

    // For auction drafts, verify the actual deadline has passed before acting.
    // Guards against stale timeRemaining=0 racing with a newly created nomination.
    if (draft.type === 'auction') {
      const nom = draft.metadata?.current_nomination;
      const deadlineStr = nom?.bid_deadline ?? draft.metadata?.nomination_deadline;
      if (deadlineStr && new Date(deadlineStr).getTime() > Date.now() + 1000) return;
    }

    autoPickTriggered.current = true;

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
        } catch {
          // Another client already triggered; polling will catch up
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
        } catch {
          // Another client may have already triggered auto-pick; polling will catch up
        }
      })();
    }
  }, [timeRemaining, draft, accessToken]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleUpdateSettings = async (updates: UpdateDraftRequest) => {
    if (!draft || !accessToken) return;
    const result = await draftApi.update(draft.id, updates, accessToken);
    setDraft(result.draft);
  };

  const handleSetOrder = async () => {
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
  };

  const handleStartDraft = async () => {
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
  };

  const handleMakePick = async () => {
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
  };

  // Auction handlers
  const handleNominate = async () => {
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
  };

  const handleBid = async (amount?: number) => {
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
  };

  // Queue handlers
  const handleReorderQueue = async (playerIds: string[]) => {
    if (!draft || !accessToken) return;
    try {
      const result = await draftApi.setQueue(draft.id, { player_ids: playerIds }, accessToken);
      setQueue(result.queue);
    } catch {
      // Silently ignore
    }
  };

  const handleRemoveFromQueue = async (playerId: string) => {
    if (!draft || !accessToken) return;
    try {
      const result = await draftApi.removeFromQueue(draft.id, playerId, accessToken);
      setQueue(result.queue);
    } catch {
      // Silently ignore
    }
  };

  const handleAddToQueue = async (playerId: string) => {
    if (!draft || !accessToken) return;
    try {
      const result = await draftApi.addToQueue(draft.id, { player_id: playerId }, accessToken);
      setQueue(result.queue);
    } catch {
      // Silently ignore
    }
  };

  const handleUpdateMaxBid = async (playerId: string, maxBid: number | null) => {
    if (!draft || !accessToken) return;
    try {
      const result = await draftApi.updateQueueMaxBid(draft.id, playerId, { max_bid: maxBid }, accessToken);
      setQueue(result.queue);
    } catch {
      // Silently ignore
    }
  };

  const handleNominationMaxBid = async (playerId: string, maxBid: number | null) => {
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
    } catch {
      // Silently ignore
    }
  };

  const handleToggleAutoPick = async () => {
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
  };

  // Compute drafted player IDs for queue display
  const draftedPlayerIds = new Set(picks.filter((p) => p.player_id).map((p) => p.player_id!));

  // Check if it's the current user's turn
  const nextPick = picks.find((p) => !p.player_id);
  const userSlot = user?.id && draft ? draft.draft_order[user.id] : undefined;
  const isMyTurn = nextPick && userSlot !== undefined && nextPick.draft_slot === userSlot;
  const currentMember = members.find((m) => m.user_id === user?.id);
  const isCommissioner = currentMember?.role === 'commissioner';

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">Loading draft...</div>
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-6xl">
          <button
            onClick={() => router.push(`/leagues/${leagueId}`)}
            className="mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back to League
          </button>
          <div className="rounded bg-red-50 p-4 text-red-600">{error || 'Draft not found'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/leagues/${leagueId}`)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Draft Room</h1>
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${
              draft.status === 'drafting'
                ? 'bg-blue-100 text-blue-700'
                : draft.status === 'complete'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
            }`}>
              {draft.status === 'drafting' ? 'Live' : draft.status === 'complete' ? 'Complete' : 'Setup'}
            </span>
          </div>
          <div className="text-sm text-gray-500">
            {draftTypeLabels[draft.type]} | {draft.settings.rounds} rounds | {isAuction ? `$${draft.settings.budget} budget | ${draft.settings.offering_timer ?? 120}s offer / ${draft.settings.nomination_timer}s bid` : `${draft.settings.pick_timer}s timer`}
          </div>
        </div>

        {/* Pre-Draft Setup */}
        {draft.status === 'pre_draft' && isCommissioner && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Draft Setup</h2>
            <div className="space-y-6">
              <DraftSettingsForm draft={draft} onSave={handleUpdateSettings} readOnly={false} />

              <div className="border-t border-gray-200 pt-4">
                <p className="mb-2 text-sm text-gray-600">
                  Draft Order: {Object.keys(draft.draft_order).length > 0
                    ? `${Object.keys(draft.draft_order).length} slots assigned`
                    : 'Not set'}
                </p>
                <button
                  onClick={handleSetOrder}
                  className="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
                >
                  {Object.keys(draft.draft_order).length > 0 ? 'Reset Draft Order' : 'Set Draft Order'}
                </button>
                <p className="mt-1 text-xs text-gray-400">
                  Auto-assigns order based on roster slot assignments
                </p>
              </div>

              {Object.keys(draft.draft_order).length > 0 && (
                <div>
                  <button
                    onClick={handleStartDraft}
                    className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Start Draft
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Draft Board */}
        {draft.status === 'drafting' && isAuction && (
          <>
            {/* Auction Controls */}
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="flex flex-wrap items-center gap-4">
                {/* Timer */}
                {timeRemaining !== null && (
                  <div className={`flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-lg font-bold ${
                    timeRemaining <= 10
                      ? 'bg-red-100 text-red-700'
                      : timeRemaining <= 20
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700'
                  }`}>
                    {formatTime(timeRemaining)}
                    <span className="text-xs font-normal">
                      {draft.metadata?.current_nomination ? 'Bidding' : 'Nominate'}
                    </span>
                  </div>
                )}
                {/* Autopick Toggle */}
                {userSlot !== undefined && (
                  <button
                    onClick={handleToggleAutoPick}
                    disabled={isTogglingAutoPick}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isAutoPick
                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } disabled:opacity-50`}
                  >
                    {isTogglingAutoPick ? '...' : isAutoPick ? 'Auto: ON' : 'Auto: OFF'}
                  </button>
                )}

                {/* Nomination Input (no active nomination, user's turn) */}
                {!draft.metadata?.current_nomination && isMyTurn && !isAutoPick && (
                  <div className="flex flex-1 items-center gap-2">
                    <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                      Your Nomination!
                    </span>
                    <input
                      type="text"
                      value={nominatePlayerId}
                      onChange={(e) => setNominatePlayerId(e.target.value)}
                      placeholder="Player ID"
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500">$</span>
                      <input
                        type="number"
                        value={nominateAmount}
                        onChange={(e) => setNominateAmount(Math.max(1, parseInt(e.target.value) || 1))}
                        min={1}
                        className="w-20 rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      onClick={handleNominate}
                      disabled={isNominating || !nominatePlayerId.trim()}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isNominating ? 'Nominating...' : 'Nominate'}
                    </button>
                  </div>
                )}

                {/* Waiting for nomination */}
                {!draft.metadata?.current_nomination && !isMyTurn && (
                  <span className="text-sm text-gray-500">
                    Waiting for nomination...
                  </span>
                )}

                {/* Bidding Controls (active nomination) */}
                {draft.metadata?.current_nomination && userSlot !== undefined && (
                  <div className="flex flex-1 items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">
                      Current: <span className="text-green-700 font-bold">${draft.metadata.current_nomination.current_bid}</span>
                    </span>
                    <button
                      onClick={() => handleBid(draft.metadata.current_nomination.current_bid + 1)}
                      disabled={isBidding}
                      className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      +$1
                    </button>
                    <button
                      onClick={() => handleBid(draft.metadata.current_nomination.current_bid + 5)}
                      disabled={isBidding}
                      className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      +$5
                    </button>
                    <button
                      onClick={() => handleBid(draft.metadata.current_nomination.current_bid + 10)}
                      disabled={isBidding}
                      className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      +$10
                    </button>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500">$</span>
                      <input
                        type="number"
                        value={bidAmount || ''}
                        onChange={(e) => setBidAmount(parseInt(e.target.value) || 0)}
                        placeholder="Custom"
                        min={1}
                        className="w-20 rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      onClick={() => handleBid()}
                      disabled={isBidding || bidAmount < 1}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isBidding ? 'Bidding...' : 'Bid'}
                    </button>
                    <NominationMaxBid
                      nomination={draft.metadata.current_nomination}
                      queue={queue}
                      budget={draft.settings.budget}
                      onUpdateMaxBid={handleNominationMaxBid}
                    />
                  </div>
                )}
              </div>
              {pickError && (
                <p className="mt-2 text-sm text-red-600">{pickError}</p>
              )}
            </div>

            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <AuctionBoard draft={draft} picks={picks} members={members} currentUserId={user?.id} />
              </div>
              {userSlot !== undefined && (
                <div className="w-72 shrink-0">
                  <DraftQueue
                    queue={queue}
                    draftedPlayerIds={draftedPlayerIds}
                    onReorder={handleReorderQueue}
                    onRemove={handleRemoveFromQueue}
                    onAdd={handleAddToQueue}
                    onUpdateMaxBid={handleUpdateMaxBid}
                    isAuction={draft.type === 'auction'}
                    budget={draft.settings.budget}
                    accessToken={accessToken!}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* Standard Draft Board (snake/linear/3rr) */}
        {draft.status === 'drafting' && !isAuction && (
          <>
            {/* Pick Input + Timer */}
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="flex items-center gap-4">
                {/* Timer */}
                {timeRemaining !== null && (
                  <div className={`flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-lg font-bold ${
                    timeRemaining <= 30
                      ? 'bg-red-100 text-red-700'
                      : timeRemaining <= 60
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700'
                  }`}>
                    {formatTime(timeRemaining)}
                  </div>
                )}
                {/* Autopick Toggle */}
                {userSlot !== undefined && (
                  <button
                    onClick={handleToggleAutoPick}
                    disabled={isTogglingAutoPick}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isAutoPick
                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                  <span className="text-sm text-gray-500">
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
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleMakePick()}
                    />
                    <button
                      onClick={handleMakePick}
                      disabled={isPicking || !pickPlayerId.trim()}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isPicking ? 'Picking...' : 'Pick'}
                    </button>
                  </div>
                )}
              </div>
              {pickError && (
                <p className="mt-2 text-sm text-red-600">{pickError}</p>
              )}
            </div>

            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <DraftBoard draft={draft} picks={picks} members={members} currentUserId={user?.id} />
              </div>
              {userSlot !== undefined && (
                <div className="w-72 shrink-0">
                  <DraftQueue
                    queue={queue}
                    draftedPlayerIds={draftedPlayerIds}
                    onReorder={handleReorderQueue}
                    onRemove={handleRemoveFromQueue}
                    onAdd={handleAddToQueue}
                    onUpdateMaxBid={handleUpdateMaxBid}
                    isAuction={draft.type === 'auction'}
                    budget={draft.settings.budget}
                    accessToken={accessToken!}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* Complete State */}
        {draft.status === 'complete' && picks.length > 0 && (
          isAuction
            ? <AuctionBoard draft={draft} picks={picks} members={members} currentUserId={user?.id} />
            : <DraftBoard draft={draft} picks={picks} members={members} currentUserId={user?.id} />
        )}

        {/* Pre-draft queue + settings */}
        {draft.status === 'pre_draft' && !isCommissioner && (
          <div className="space-y-4">
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-bold text-gray-900">Draft Settings</h2>
              <DraftSettingsForm draft={draft} onSave={async () => {}} readOnly={true} />
              <p className="mt-4 text-center text-sm text-gray-400">
                Waiting for the commissioner to start the draft.
              </p>
            </div>
            {userSlot !== undefined && (
              <DraftQueue
                queue={queue}
                draftedPlayerIds={draftedPlayerIds}
                onReorder={handleReorderQueue}
                onRemove={handleRemoveFromQueue}
                onAdd={handleAddToQueue}
                onUpdateMaxBid={handleUpdateMaxBid}
                isAuction={draft.type === 'auction'}
                budget={draft.settings.budget}
                accessToken={accessToken!}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
