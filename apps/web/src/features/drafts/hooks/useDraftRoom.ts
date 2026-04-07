import { useState, useEffect, useCallback } from 'react';
import { draftApi, leagueApi, ApiError, type Draft, type DraftPick, type DraftQueueItem, type LeagueMember, type Roster, type AuctionLot, type RosterBudget, type NominationStatsResponse, type League } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useSocket } from '@/features/chat/context/SocketProvider';
import { useDraftTimer } from './useDraftTimer';
import { useDraftSocket } from './useDraftSocket';
import { useAutoPickExpiry } from './useAutoPickExpiry';
import { useDraftActions } from './useDraftActions';

export function useDraftRoom(leagueId: string, preferredDraftId?: string) {
  const { accessToken, user } = useAuth();
  const { socket } = useSocket();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Queue state
  const [queue, setQueue] = useState<DraftQueueItem[]>([]);
  const [sidebarTab, setSidebarTab] = useState<'queue' | 'players' | 'schedule'>('players');

  // Slow auction state
  const [slowAuctionLots, setSlowAuctionLots] = useState<AuctionLot[]>([]);
  const [slowAuctionBudgets, setSlowAuctionBudgets] = useState<RosterBudget[]>([]);
  const [nominationStats, setNominationStats] = useState<NominationStatsResponse | null>(null);

  const timer = useDraftTimer(draft);

  // Socket subscriptions
  const { refreshSlowAuctionData } = useDraftSocket({
    socket,
    draft,
    accessToken,
    updateClockOffset: timer.updateClockOffset,
    setDraft,
    setPicks,
    setQueue,
    setSlowAuctionLots,
    setSlowAuctionBudgets,
    setNominationStats,
  });

  // Auto-pick / auction resolve when timer expires
  useAutoPickExpiry({
    timeRemaining: timer.timeRemaining,
    autoPickTriggered: timer.autoPickTriggered,
    clockOffsetRef: timer.clockOffsetRef,
    draft,
    accessToken,
    setDraft,
    setPicks,
  });

  // Action handlers
  const actions = useDraftActions({
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
  });

  const fetchDraftData = useCallback(async () => {
    if (!accessToken) return;

    try {
      const draftsResult = await draftApi.getByLeague(leagueId, accessToken);
      const activeDraft = (preferredDraftId
        ? draftsResult.drafts.find((d: Draft) => d.id === preferredDraftId)
        : null)
        ?? draftsResult.drafts.find(
          (d: Draft) => d.status === 'pre_draft' || d.status === 'drafting'
        ) ?? draftsResult.drafts.find((d: Draft) => d.status === 'complete');

      if (!activeDraft) {
        setError('No active draft found');
        setIsLoading(false);
        return;
      }

      const [draftResult, membersResult, rostersResult, leagueResult] = await Promise.all([
        draftApi.getById(activeDraft.id, accessToken),
        leagueApi.getMembers(leagueId, accessToken),
        leagueApi.getRosters(leagueId, accessToken),
        leagueApi.getById(leagueId, accessToken),
      ]);

      setDraft(draftResult.draft);
      setLeague(leagueResult.league);
      setMembers(membersResult.members);
      setRosters(rostersResult.rosters);

      timer.updateClockOffset(draftResult.server_time);

      const picksResult = await draftApi.getPicks(activeDraft.id, accessToken);
      setPicks(picksResult.picks);

      if (draftResult.draft.status !== 'complete') {
        try {
          const queueResult = await draftApi.getQueue(activeDraft.id, accessToken);
          setQueue(queueResult.queue);
        } catch {
          // Queue fetch is non-critical
        }
      }

      if (draftResult.draft.type === 'slow_auction' && (draftResult.draft.status === 'drafting' || draftResult.draft.status === 'complete')) {
        try {
          const [lotsResult, budgetsResult] = await Promise.all([
            draftApi.getSlowAuctionLots(activeDraft.id, accessToken),
            draftApi.getSlowAuctionBudgets(activeDraft.id, accessToken),
          ]);
          setSlowAuctionLots(lotsResult.lots);
          setSlowAuctionBudgets(budgetsResult.budgets);

          if (draftResult.draft.status === 'drafting') {
            const statsResult = await draftApi.getNominationStats(activeDraft.id, accessToken);
            setNominationStats(statsResult);
          }
        } catch {
          // Slow auction data fetch is non-critical
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

  // Fallback polling
  useEffect(() => {
    if (!draft || draft.status !== 'drafting' || !accessToken) return;

    const interval = setInterval(async () => {
      try {
        if (draft.type === 'slow_auction') {
          const [draftResult, lotsResult, budgetsResult] = await Promise.all([
            draftApi.getById(draft.id, accessToken),
            draftApi.getSlowAuctionLots(draft.id, accessToken),
            draftApi.getSlowAuctionBudgets(draft.id, accessToken),
          ]);
          setDraft(draftResult.draft);
          if (draftResult.server_time) timer.updateClockOffset(draftResult.server_time);
          setSlowAuctionLots(lotsResult.lots);
          setSlowAuctionBudgets(budgetsResult.budgets);
        } else {
          const [draftResult, picksResult] = await Promise.all([
            draftApi.getById(draft.id, accessToken),
            draftApi.getPicks(draft.id, accessToken),
          ]);
          setDraft(draftResult.draft);
          if (draftResult.server_time) timer.updateClockOffset(draftResult.server_time);
          setPicks(picksResult.picks);
        }
      } catch {
        // Silently ignore polling errors
      }
    }, draft.type === 'slow_auction' ? 30000 : 10000);

    return () => clearInterval(interval);
  }, [draft?.id, draft?.status, draft?.type, accessToken]);

  // Derived state
  const isAuction = draft?.type === 'auction';
  const isSlowAuction = draft?.type === 'slow_auction';
  const autoPickUsers: string[] = draft?.metadata?.auto_pick_users ?? [];
  const isAutoPick = user?.id ? autoPickUsers.includes(user.id) : false;
  const draftedPlayerIds = new Set(picks.filter((p) => p.player_id).map((p) => p.player_id!));
  const nextPick = picks.find((p) => !p.player_id);
  const userSlot = user?.id && draft?.draft_order ? draft.draft_order[user.id] : undefined;
  const userRosterId = rosters.find(r => r.owner_id === user?.id)?.roster_id;
  const isMyTurn = nextPick && userRosterId !== undefined && nextPick.roster_id === userRosterId;
  const currentMember = members.find((m) => m.user_id === user?.id);
  const isCommissioner = currentMember?.role === 'commissioner';
  const clockState = ((draft?.metadata?.clock_state as string | undefined) ?? 'running') as 'running' | 'paused' | 'stopped';
  const isDraftPaused = clockState === 'paused';
  const isDraftStopped = clockState === 'stopped';

  return {
    // Core state
    draft,
    league,
    picks,
    members,
    rosters,
    queue,
    isLoading,
    error,
    user,
    accessToken,

    // UI state
    sidebarTab,
    setSidebarTab,
    ...actions,

    // Timer
    timeRemaining: timer.timeRemaining,
    formatTime: timer.formatTime,

    // Derived state
    isAuction,
    isSlowAuction,
    isAutoPick,
    draftedPlayerIds,
    nextPick,
    userSlot,
    userRosterId,
    isMyTurn,
    isCommissioner,
    clockState,
    isDraftPaused,
    isDraftStopped,

    // Slow auction state
    slowAuctionLots,
    slowAuctionBudgets,
    nominationStats,
  };
}
