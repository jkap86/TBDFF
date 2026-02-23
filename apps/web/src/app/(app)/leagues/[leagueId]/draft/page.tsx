'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { draftApi, leagueApi, ApiError, type Draft, type DraftPick, type LeagueMember, type Roster } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { DraftBoard } from '@/features/drafts/components/DraftBoard';

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
    }, 5000);

    return () => clearInterval(interval);
  }, [draft, accessToken]);

  // Countdown timer
  useEffect(() => {
    if (!draft || draft.status !== 'drafting' || !draft.settings.pick_timer) {
      setTimeRemaining(null);
      return;
    }

    const referenceTime = draft.last_picked || draft.start_time;
    if (!referenceTime) {
      setTimeRemaining(null);
      return;
    }

    // Reset auto-pick flag when reference time changes (new pick was made)
    autoPickTriggered.current = false;

    const deadline = new Date(referenceTime).getTime() + draft.settings.pick_timer * 1000;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeRemaining(remaining);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [draft?.status, draft?.last_picked, draft?.start_time, draft?.settings.pick_timer]);

  // Auto-pick when timer expires
  useEffect(() => {
    if (timeRemaining !== 0 || !draft || !accessToken || autoPickTriggered.current) return;
    autoPickTriggered.current = true;

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
        // Refresh draft state for updated last_picked and auto_pick_users
        const draftResult = await draftApi.getById(draft.id, accessToken);
        setDraft(draftResult.draft);
      } catch {
        // Another client may have already triggered auto-pick; polling will catch up
      }
    })();
  }, [timeRemaining, draft, accessToken]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
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
            {draftTypeLabels[draft.type]} | {draft.settings.rounds} rounds | {draft.settings.pick_timer}s timer
          </div>
        </div>

        {/* Pre-Draft Setup */}
        {draft.status === 'pre_draft' && isCommissioner && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Draft Setup</h2>
            <div className="space-y-4">
              <div>
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
        {draft.status === 'drafting' && (
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

            <DraftBoard draft={draft} picks={picks} members={members} currentUserId={user?.id} />
          </>
        )}

        {/* Complete State */}
        {draft.status === 'complete' && picks.length > 0 && (
          <DraftBoard draft={draft} picks={picks} members={members} currentUserId={user?.id} />
        )}

        {/* Pre-draft - no board yet */}
        {draft.status === 'pre_draft' && !isCommissioner && (
          <div className="rounded-lg bg-white p-6 shadow text-center">
            <p className="text-gray-500">Waiting for the commissioner to set up and start the draft.</p>
          </div>
        )}
      </div>
    </div>
  );
}
