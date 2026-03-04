'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, MessageSquare, ArrowLeftRight, ClipboardList, Activity, ChevronDown, Trophy, Users2, Shuffle, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { leagueApi, draftApi, matchupApi, paymentApi, ApiError, type UpdateLeagueRequest, type Draft, type Matchup } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { LeagueSettingsModal } from '@/features/leagues/components/LeagueSettingsModal';
import { DraftSettingsModal } from '@/features/drafts/components/DraftSettingsModal';
import { DerbyPickBoard } from '@/features/drafts/components/DerbyPickBoard';
import { useConversations } from '@/features/chat/hooks/useConversations';
import { useChatPanel } from '@/features/chat/context/ChatPanelContext';
import { useSocket } from '@/features/chat/context/SocketProvider';
import { LeagueDetailSkeleton } from '@/features/leagues/components/LeagueDetailSkeleton';
import { useLeagueQuery, useMembersQuery, useRostersQuery } from '@/hooks/useLeagueQueries';
import { SCORING_CATEGORIES, scoringFromLeague } from '@/features/leagues/config/scoring-config';
import { ROSTER_POSITION_CONFIG, positionArrayToCounts } from '@/features/leagues/config/roster-config';
import { MatchupDerbySettingsModal } from '@/features/matchups/components/MatchupDerbySettingsModal';

const draftTypeLabels: Record<string, string> = {
  snake: 'Snake',
  linear: 'Linear',
  '3rr': '3rd Round Reversal',
  auction: 'Auction',
};

export default function LeagueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();

  // --- Data queries (cached, instant on revisit) ---
  const { data: league, isLoading, error: leagueError } = useLeagueQuery(leagueId);
  const { data: members = [] } = useMembersQuery(leagueId);
  const { data: rosters = [] } = useRostersQuery(leagueId);
  const { data: draftsData } = useQuery({
    queryKey: ['drafts', leagueId],
    queryFn: () => draftApi.getByLeague(leagueId, accessToken!),
    enabled: !!accessToken,
  });
  const drafts = draftsData?.drafts ?? [];
  const { data: matchupsData } = useQuery({
    queryKey: ['matchups', leagueId],
    queryFn: () => matchupApi.getAll(leagueId, accessToken!).catch(() => ({ matchups: [] as Matchup[] })),
    enabled: !!accessToken,
  });
  const matchups = matchupsData?.matchups ?? [];
  const { data: paymentsData } = useQuery({
    queryKey: ['payments', leagueId],
    queryFn: () => paymentApi.getPayments(leagueId, accessToken!),
    enabled: !!accessToken,
  });
  const payments = paymentsData?.payments ?? [];
  const error = leagueError ? (leagueError as Error).message : null;

  // --- UI state ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [reRandomizeDraftId, setReRandomizeDraftId] = useState<string | null>(null);
  const [expandedDraftOrders, setExpandedDraftOrders] = useState<Set<string>>(new Set());
  const [expandedDerbyResults, setExpandedDerbyResults] = useState<Set<string>>(new Set());
  const [shuffleDisplay, setShuffleDisplay] = useState<{ draftId: string; lockedCount: number; displayRosterIds: number[] } | null>(null);
  const shuffleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isStartingDerby, setIsStartingDerby] = useState(false);
  const [isGeneratingMatchups, setIsGeneratingMatchups] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [isScoringExpanded, setIsScoringExpanded] = useState(false);
  const [isRosterExpanded, setIsRosterExpanded] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isDuesEditing, setIsDuesEditing] = useState(false);
  const [isDuesExpanded, setIsDuesExpanded] = useState<boolean | null>(null);
  const [isSpectatorsExpanded, setIsSpectatorsExpanded] = useState(false);
  const [isDraftsExpanded, setIsDraftsExpanded] = useState(true);
  const [showDerbySettings, setShowDerbySettings] = useState(false);
  const { startConversation } = useConversations();
  const { openConversation } = useChatPanel();
  const { socket } = useSocket();

  // --- Cache update helpers ---
  const updateDraftsCache = (updater: (prev: Draft[]) => Draft[]) => {
    queryClient.setQueryData(['drafts', leagueId], (old: any) => {
      if (!old) return old;
      return { ...old, drafts: updater(old.drafts) };
    });
  };

  const handleUpdateLeague = async (updates: UpdateLeagueRequest) => {
    if (!accessToken) throw new Error('Not authenticated');

    const result = await leagueApi.update(leagueId, updates, accessToken);
    queryClient.setQueryData(['league', leagueId], result);
  };

  const handleDeleteLeague = async () => {
    if (!accessToken) throw new Error('Not authenticated');

    await leagueApi.delete(leagueId, accessToken);
    queryClient.invalidateQueries({ queryKey: ['leagues'] });
    router.push('/leagues');
  };

  const handleAssignRoster = async (rosterId: number, userId: string) => {
    if (!accessToken) throw new Error('Not authenticated');

    await leagueApi.assignRoster(leagueId, rosterId, { user_id: userId }, accessToken);
    queryClient.invalidateQueries({ queryKey: ['rosters', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['members', leagueId] });
  };

  const handleUnassignRoster = async (rosterId: number) => {
    if (!accessToken) throw new Error('Not authenticated');

    await leagueApi.unassignRoster(leagueId, rosterId, accessToken);
    queryClient.invalidateQueries({ queryKey: ['rosters', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['members', leagueId] });
  };

  const handleUpdateDraft = async (draftId: string, updates: import('@/lib/api').UpdateDraftRequest) => {
    if (!accessToken) return;

    const result = await draftApi.update(draftId, updates, accessToken);
    updateDraftsCache((prev) => prev.map((d) => (d.id === result.draft.id ? result.draft : d)));
  };

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
      setExpandedDraftOrders((prev) => new Set(prev).add(draft.id));

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

  const handleStartDerby = async (draft: Draft) => {
    if (!accessToken) return;

    try {
      setIsStartingDerby(true);
      setMutationError(null);
      const result = await draftApi.startDerby(draft.id, accessToken);
      updateDraftsCache((prev) => prev.map((d) => (d.id === result.draft.id ? result.draft : d)));
    } catch (err) {
      if (err instanceof ApiError) {
        setMutationError(err.message);
      }
    } finally {
      setIsStartingDerby(false);
    }
  };

  useEffect(() => {
    return () => {
      if (shuffleIntervalRef.current) clearInterval(shuffleIntervalRef.current);
    };
  }, []);

  // Find active draft for derby socket subscription
  const activeDraftForDerby = drafts.find((d) => d.status === 'pre_draft' || d.status === 'drafting');
  const derbyStatus = (activeDraftForDerby?.metadata?.derby as any)?.status;

  // Socket subscription for real-time derby updates
  useEffect(() => {
    if (!socket || !activeDraftForDerby?.id || derbyStatus !== 'active') return;

    socket.emit('draft:join', activeDraftForDerby.id);

    const handleStateUpdate = (data: { draft: any; server_time?: string }) => {
      if (data.draft) {
        updateDraftsCache((prev) => prev.map((d) => (d.id === data.draft.id ? data.draft : d)));
      }
    };

    socket.on('draft:state_updated', handleStateUpdate);

    return () => {
      socket.off('draft:state_updated', handleStateUpdate);
      socket.emit('draft:leave', activeDraftForDerby.id);
    };
  }, [socket, activeDraftForDerby?.id, derbyStatus]);

  // Polling fallback for derby state
  useEffect(() => {
    if (!activeDraftForDerby?.id || !accessToken || derbyStatus !== 'active') return;

    const interval = setInterval(async () => {
      try {
        queryClient.invalidateQueries({ queryKey: ['drafts', leagueId] });
      } catch {
        // Non-fatal
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeDraftForDerby?.id, derbyStatus, accessToken, leagueId]);

  const handleDraftUpdated = useCallback((updatedDraft: Draft) => {
    updateDraftsCache((prev) => prev.map((d) => (d.id === updatedDraft.id ? updatedDraft : d)));
  }, [leagueId, queryClient]);

  const handleGenerateMatchups = async () => {
    if (!accessToken) return;

    try {
      setIsGeneratingMatchups(true);
      setMutationError(null);
      const result = await matchupApi.generate(leagueId, accessToken);
      queryClient.setQueryData(['matchups', leagueId], result);
      setSelectedWeek(1);
    } catch (err) {
      if (err instanceof ApiError) {
        setMutationError(err.message);
      }
    } finally {
      setIsGeneratingMatchups(false);
    }
  };

  const handleStartDM = async (memberId: string) => {
    try {
      const conversation = await startConversation(memberId);
      openConversation(conversation);
    } catch {
      // Non-fatal — user may already have the panel open
    }
  };

  const handleRefreshLeague = async () => {
    queryClient.invalidateQueries({ queryKey: ['league', leagueId] });
  };

  // Check if current user is a commissioner (commissioner is the owner in this app)
  const currentUserMember = members.find((m) => m.user_id === user?.id);
  const isCommissioner = currentUserMember?.role === 'commissioner';
  const isOwner = isCommissioner; // Commissioner is the owner role

  // Find active drafts (pre_draft or drafting), sorted vet-first
  const activeDrafts = drafts
    .filter((d) => d.status === 'pre_draft' || d.status === 'drafting')
    .sort((a, b) => b.settings.player_type - a.settings.player_type);
  const activeDraft = activeDrafts[0] ?? null; // for derby/socket backward compat
  const completedDrafts = drafts.filter((d) => d.status === 'complete');

  const playerPoolLabel = (pt: number) =>
    pt === 2 ? 'Veteran Draft' : pt === 1 ? 'Rookie Draft' : 'Draft';

  if (isLoading) {
    return <LeagueDetailSkeleton />;
  }

  if (error || !league) {
    return (
      <div className="min-h-screen bg-surface p-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded bg-destructive p-4 text-destructive-foreground">{error || 'League not found'}</div>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pre_draft: 'bg-muted text-accent-foreground',
    drafting: 'bg-primary/10 text-primary',
    in_season: 'bg-success text-success-foreground',
    complete: 'bg-muted text-muted-foreground',
  };

  const statusLabels: Record<string, string> = {
    pre_draft: 'Pre-Draft',
    drafting: 'Drafting',
    in_season: 'In Season',
    complete: 'Complete',
  };

  const roleColors: Record<string, string> = {
    commissioner: 'bg-primary/10 text-primary',
    member: 'bg-muted text-muted-foreground',
    spectator: 'bg-warning text-warning-foreground',
  };

  const draftStatusColors: Record<string, string> = {
    pre_draft: 'bg-warning text-warning-foreground',
    drafting: 'bg-primary/10 text-primary',
    complete: 'bg-success text-success-foreground',
  };

  const draftStatusLabels: Record<string, string> = {
    pre_draft: 'Setup',
    drafting: 'In Progress',
    complete: 'Complete',
  };

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* League Header */}
        <div className="rounded-lg bg-card p-6 shadow">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{league.name}</h1>
              {isCommissioner && (
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-accent-foreground"
                  title="League Settings"
                >
                  <Settings className="h-5 w-5" />
                </button>
              )}
            </div>
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${statusColors[league.status] || statusColors.pre_draft}`}
            >
              {statusLabels[league.status] || league.status}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Season</p>
              <p className="text-lg font-medium text-foreground">{league.season}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Teams</p>
              <p className="text-lg font-medium text-foreground">{league.total_rosters}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">League Type</p>
              <p className="text-lg font-medium text-foreground">
                {league.settings?.type === 0
                  ? 'Redraft'
                  : league.settings?.type === 1
                    ? 'Keeper'
                    : 'Dynasty'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Starters</p>
              <p className="text-lg font-medium text-foreground">
                {(league.roster_positions ?? []).filter(p => p !== 'BN' && p !== 'IR').length}
              </p>
            </div>
          </div>

          {/* Expandable Scoring Settings */}
          <div className="mt-4 rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setIsScoringExpanded(!isScoringExpanded)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
            >
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                <span>Scoring Settings</span>
                <span className="text-xs text-muted-foreground">
                  ({league.scoring_settings?.rec === 1 ? 'PPR' : league.scoring_settings?.rec === 0.5 ? 'Half-PPR' : 'Standard'})
                </span>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${isScoringExpanded ? 'rotate-180' : ''}`} />
            </button>
            {isScoringExpanded && (() => {
              const scoring = scoringFromLeague(league);
              return (
                <div className="border-t border-border px-4 py-3 space-y-4">
                  {SCORING_CATEGORIES.map((cat) => (
                    <div key={cat.title}>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{cat.title}</h4>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {cat.fields.map((f) => (
                          <div key={f.key} className="flex items-center justify-between text-sm">
                            <span className="text-accent-foreground">{f.label}</span>
                            <span className="font-medium text-foreground">{scoring[f.key]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Expandable Roster Positions */}
          <div className="mt-2 rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setIsRosterExpanded(!isRosterExpanded)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
            >
              <div className="flex items-center gap-2">
                <Users2 className="h-4 w-4 text-muted-foreground" />
                <span>Roster Positions</span>
                <span className="text-xs text-muted-foreground">
                  ({(league.roster_positions ?? []).length} slots)
                </span>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${isRosterExpanded ? 'rotate-180' : ''}`} />
            </button>
            {isRosterExpanded && (() => {
              const counts = positionArrayToCounts(league.roster_positions ?? []);
              return (
                <div className="border-t border-border px-4 py-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {ROSTER_POSITION_CONFIG.filter((pos) => counts[pos.key] > 0).map((pos) => (
                      <div key={pos.key} className="flex items-center justify-between text-sm">
                        <span className="text-accent-foreground">{pos.label}</span>
                        <span className="font-medium text-foreground">{counts[pos.key]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Dues */}
        {(() => {
          const buyIn = (league.settings as Record<string, unknown>).buy_in as number | undefined;
          const hasBuyIn = buyIn != null && buyIn > 0;
          const buyIns = payments.filter((p) => p.type === 'buy_in');
          const paidBuyInUserIds = new Set(buyIns.map((p) => p.user_id));
          const rosterOwnerIds = new Set(rosters.map((r) => r.owner_id).filter(Boolean));
          const isMemberPaid = (userId: string) =>
            hasBuyIn ? paidBuyInUserIds.has(userId) : rosterOwnerIds.has(userId);
          const activeMembers = members.filter((m) => m.role !== 'spectator');
          const spectators = members.filter((m) => m.role === 'spectator');
          const emptyRosters = rosters.filter((r) => !r.owner_id).sort((a, b) => a.roster_id - b.roster_id);
          const totalRosters = rosters.length;
          const paidCount = activeMembers.filter((m) => isMemberPaid(m.user_id)).length;
          const allPaid = paidCount === totalRosters;
          const duesExpanded = isDuesExpanded ?? !allPaid;

          const handleMarkPaid = async (userId: string) => {
            if (!accessToken || !buyIn) return;
            try {
              const result = await paymentApi.recordBuyIn(leagueId, { user_id: userId, amount: buyIn }, accessToken);
              queryClient.setQueryData(['payments', leagueId], (old: any) =>
                old ? { ...old, payments: [...old.payments, result.payment] } : old,
              );
              toast.success('Marked as paid');
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : 'Failed to record payment');
            }
          };

          const handleMarkUnpaid = async (userId: string) => {
            if (!accessToken) return;
            const payment = buyIns.find((p) => p.user_id === userId);
            if (!payment) return;
            try {
              await paymentApi.removePayment(leagueId, payment.id, accessToken);
              queryClient.setQueryData(['payments', leagueId], (old: any) =>
                old ? { ...old, payments: old.payments.filter((p: any) => p.id !== payment.id) } : old,
              );
              toast.success('Payment removed');
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : 'Failed to remove payment');
            }
          };

          return (
            <div className="rounded-lg bg-card p-6 shadow">
              <div className={`flex items-center justify-between ${duesExpanded ? 'mb-4' : ''}`}>
                <button
                  onClick={() => setIsDuesExpanded((prev) => (prev ?? !allPaid) ? false : true)}
                  className="flex flex-1 items-center gap-3"
                >
                  <ChevronDown
                    className={`h-5 w-5 text-muted-foreground transition-transform ${duesExpanded ? '' : '-rotate-90'}`}
                  />
                  <h2 className="text-xl font-bold text-foreground">
                    Dues {hasBuyIn ? `- $${buyIn}` : '- Free'}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {paidCount}/{totalRosters} Paid
                  </span>
                </button>
                {isCommissioner && duesExpanded && (
                  <button
                    onClick={() => setIsDuesEditing((prev) => !prev)}
                    className="rounded p-1.5 text-disabled hover:bg-muted hover:text-accent-foreground"
                    title={isDuesEditing ? 'Done editing' : 'Edit dues'}
                  >
                    {isDuesEditing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {/* Active members */}
              {duesExpanded && (<>
              <div className="space-y-2">
                {activeMembers.map((member) => {
                  const paid = isMemberPaid(member.user_id);
                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded border border-border p-3"
                    >
                      <div>
                        <p className="font-medium text-foreground">{member.username}</p>
                        {member.display_name && (
                          <p className="text-sm text-muted-foreground">{member.display_name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {member.user_id !== user?.id && !isDuesEditing && (
                          <button
                            onClick={() => handleStartDM(member.user_id)}
                            className="rounded p-1.5 text-disabled hover:bg-muted hover:text-link"
                            title={`Message ${member.username}`}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                        )}
                        {isDuesEditing && hasBuyIn ? (
                          paid ? (
                            <button
                              onClick={() => handleMarkUnpaid(member.user_id)}
                              className="flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-xs font-medium text-success-foreground hover:bg-destructive hover:text-destructive-foreground"
                              title="Remove payment"
                            >
                              Paid <X className="h-3 w-3" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleMarkPaid(member.user_id)}
                              className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-success hover:text-success-foreground"
                              title="Mark as paid"
                            >
                              Unpaid <Check className="h-3 w-3" />
                            </button>
                          )
                        ) : (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              paid
                                ? 'bg-success text-success-foreground'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {paid ? 'Paid' : 'Unpaid'}
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium uppercase ${roleColors[member.role]}`}
                        >
                          {member.role}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Empty rosters */}
              {emptyRosters.length > 0 && (
                <div className="mt-4 space-y-2">
                  {emptyRosters.map((roster) => (
                    <div
                      key={roster.roster_id}
                      className="flex items-center justify-between rounded border border-dashed border-border p-3"
                    >
                      <p className="text-sm text-muted-foreground">Roster {roster.roster_id}</p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Empty
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Spectators */}
              {spectators.length > 0 && (
                <div className="mt-5">
                  <button
                    onClick={() => setIsSpectatorsExpanded((prev) => !prev)}
                    className="mb-2 flex items-center gap-1.5"
                  >
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${isSpectatorsExpanded ? '' : '-rotate-90'}`}
                    />
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      Spectators ({spectators.length})
                    </h3>
                  </button>
                  {isSpectatorsExpanded && (
                  <div className="space-y-2">
                    {spectators.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded border border-border p-3"
                      >
                        <div>
                          <p className="font-medium text-foreground">{member.username}</p>
                          {member.display_name && (
                            <p className="text-sm text-muted-foreground">{member.display_name}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {member.user_id !== user?.id && !isDuesEditing && (
                            <button
                              onClick={() => handleStartDM(member.user_id)}
                              className="rounded p-1.5 text-disabled hover:bg-muted hover:text-link"
                              title={`Message ${member.username}`}
                            >
                              <MessageSquare className="h-4 w-4" />
                            </button>
                          )}
                          {isDuesEditing && emptyRosters.length > 0 && (
                            <button
                              onClick={async () => {
                                try {
                                  await handleAssignRoster(emptyRosters[0].roster_id, member.user_id);
                                  toast.success(`Assigned ${member.username} to Roster ${emptyRosters[0].roster_id}`);
                                } catch {
                                  toast.error('Failed to assign roster');
                                }
                              }}
                              className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
                            >
                              Assign Roster
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              )}
              </>)}
            </div>
          );
        })()}

        {/* Drafts Card */}
        <div className="rounded-lg bg-card p-6 shadow">
          <div className={`flex items-center justify-between ${isDraftsExpanded ? 'mb-4' : ''}`}>
            <button
              onClick={() => setIsDraftsExpanded((prev) => !prev)}
              className="flex flex-1 items-center gap-3"
            >
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground transition-transform ${isDraftsExpanded ? '' : '-rotate-90'}`}
              />
              <h2 className="text-xl font-bold text-foreground">Drafts</h2>
              <span className="text-sm text-muted-foreground">
                {activeDrafts.length} active{completedDrafts.length > 0 ? `, ${completedDrafts.length} completed` : ''}
              </span>
            </button>
          </div>

          {isDraftsExpanded && (<>
          {activeDrafts.length > 0 ? (
          <div className="space-y-4">
          {activeDrafts.map((draft) => {
            const draftShuffle = shuffleDisplay?.draftId === draft.id ? shuffleDisplay : null;
            const isDraftOrderOpen = expandedDraftOrders.has(draft.id);
            const isDerbyResultsOpen = expandedDerbyResults.has(draft.id);
            const toggleDraftOrder = () => setExpandedDraftOrders((prev) => {
              const next = new Set(prev);
              next.has(draft.id) ? next.delete(draft.id) : next.add(draft.id);
              return next;
            });
            const toggleDerbyResults = () => setExpandedDerbyResults((prev) => {
              const next = new Set(prev);
              next.has(draft.id) ? next.delete(draft.id) : next.add(draft.id);
              return next;
            });

            return (
              <div key={draft.id} className="rounded-lg border border-border p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-foreground">{playerPoolLabel(draft.settings.player_type)}</h2>
                    {isCommissioner && draft.status === 'pre_draft' && (
                      <>
                        <button
                          onClick={() => setEditingDraftId(draft.id)}
                          className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-accent-foreground"
                          title="Draft Settings"
                        >
                          <Settings className="h-5 w-5" />
                        </button>
                        {draft.type !== 'slow_auction' && !(draft.metadata?.derby as any)?.status
                          && !(draft.settings.player_type === 1 && drafts.some((d) => d.settings.player_type === 2 && d.settings.include_rookie_picks === 1)) && (
                          <button
                            onClick={() => {
                              const hasOrder = Object.keys(draft.draft_order ?? {}).length > 0;
                              if (hasOrder) {
                                setReRandomizeDraftId(draft.id);
                                return;
                              }
                              handleRandomizeDraftOrder(draft);
                            }}
                            disabled={draftShuffle !== null}
                            className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-accent-foreground disabled:opacity-50"
                            title={Object.keys(draft.draft_order ?? {}).length > 0 ? 'Re-randomize Draft Order' : 'Randomize Draft Order'}
                          >
                            <Shuffle className="h-5 w-5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm font-medium ${draftStatusColors[draft.status]}`}>
                    {draftStatusLabels[draft.status]}
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Type</p>
                      <p className="font-medium text-foreground">{draftTypeLabels[draft.type] || draft.type}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Rounds</p>
                      <p className="font-medium text-foreground">{draft.settings.rounds}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Pick Timer</p>
                      <p className="font-medium text-foreground">
                        {(() => {
                          const t = draft.settings.pick_timer;
                          if (t === 0) return 'Off';
                          const h = Math.floor(t / 3600);
                          const m = Math.floor((t % 3600) / 60);
                          const s = t % 60;
                          return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
                        })()}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    {draft.status === 'drafting' && (
                      <Link
                        href={`/leagues/${leagueId}/draft?draftId=${draft.id}`}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                      >
                        Enter Draft Room
                      </Link>
                    )}
                    {draft.status === 'pre_draft' && (
                      <>
                        {isCommissioner && (draft.metadata?.order_method ?? 'randomize') === 'derby'
                          && Object.keys(draft.draft_order ?? {}).length > 0
                          && !(draft.metadata?.derby as any)?.status && (
                          <button
                            onClick={() => handleStartDerby(draft)}
                            disabled={isStartingDerby}
                            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {isStartingDerby ? 'Starting...' : 'Start Derby'}
                          </button>
                        )}
                        <Link
                          href={`/leagues/${leagueId}/draft?draftId=${draft.id}`}
                          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                        >
                          Enter Draft Room
                        </Link>
                      </>
                    )}
                  </div>

                  {/* Derby Pick Board — shown when derby is active */}
                  {(draft.metadata?.derby as any)?.status === 'active' && (
                    <DerbyPickBoard
                      draft={draft}
                      members={members}
                      userId={user?.id}
                      isCommissioner={isCommissioner}
                      accessToken={accessToken!}
                      onDraftUpdated={handleDraftUpdated}
                    />
                  )}

                  {/* Derby Results — collapsible, shown after derby completes */}
                  {(draft.metadata?.derby as any)?.status === 'complete' && (() => {
                    const derby = draft.metadata?.derby as any;
                    return (
                      <div className="rounded-lg border border-border">
                        <button
                          type="button"
                          onClick={toggleDerbyResults}
                          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
                        >
                          <span>Derby Results ({derby.picks.length} picks)</span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${isDerbyResultsOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isDerbyResultsOpen && (
                          <div className="border-t border-border px-4 py-3">
                            <ol className="space-y-1">
                              {derby.derby_order.map((entry: any, index: number) => {
                                const pick = derby.picks.find((p: any) => p.user_id === entry.user_id);
                                const member = members.find((m) => m.user_id === entry.user_id);
                                return (
                                  <li
                                    key={entry.user_id}
                                    className="flex items-center justify-between text-sm"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="w-6 text-right font-medium text-muted-foreground">{index + 1}.</span>
                                      <span className="text-foreground">{member?.display_name || entry.username}</span>
                                    </div>
                                    {pick && (
                                      <span className="text-xs font-medium text-success-foreground">
                                        Slot #{pick.selected_slot}
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ol>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {(draft.metadata?.derby as any)?.status !== 'active' && (Object.keys(draft.slot_to_roster_id ?? {}).length > 0 || draftShuffle) && (
                    <div className="rounded-lg border border-border">
                      <button
                        type="button"
                        onClick={toggleDraftOrder}
                        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
                      >
                        <span>Draft Order ({Object.keys(draft.slot_to_roster_id ?? {}).length} teams)</span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${isDraftOrderOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isDraftOrderOpen && (
                        <div className="border-t border-border px-4 py-3">
                          <ol className="space-y-1">
                            {draftShuffle
                              ? draftShuffle.displayRosterIds.map((rosterId, index) => {
                                  const roster = rosters.find((r) => r.roster_id === rosterId);
                                  const member = roster?.owner_id ? members.find((m) => m.user_id === roster.owner_id) : null;
                                  return (
                                    <li
                                      key={`slot-${index + 1}`}
                                      className={`flex items-center gap-2 text-sm transition-colors duration-150 ${
                                        index < draftShuffle.lockedCount
                                          ? 'text-foreground font-medium'
                                          : 'text-disabled'
                                      }`}
                                    >
                                      <span className="w-6 text-right font-medium text-muted-foreground">{index + 1}.</span>
                                      <span>{member ? (member.display_name || member.username) : <span className="italic text-muted-foreground">Team {rosterId}</span>}</span>
                                    </li>
                                  );
                                })
                              : Object.entries(draft.slot_to_roster_id)
                                  .sort(([a], [b]) => Number(a) - Number(b))
                                  .map(([slotStr, rosterId]) => {
                                    const roster = rosters.find((r) => r.roster_id === rosterId);
                                    const member = roster?.owner_id ? members.find((m) => m.user_id === roster.owner_id) : null;
                                    return (
                                      <li
                                        key={`slot-${slotStr}`}
                                        className="flex items-center gap-2 text-sm text-foreground font-medium"
                                      >
                                        <span className="w-6 text-right font-medium text-muted-foreground">{slotStr}.</span>
                                        <span>{member ? (member.display_name || member.username) : <span className="italic text-muted-foreground">Team {rosterId}</span>}</span>
                                      </li>
                                    );
                                  })
                            }
                          </ol>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        ) : (
            <div className="text-center py-4">
              {completedDrafts.length === 0 && (
                <p className="text-muted-foreground">No draft has been created yet.</p>
              )}
              {completedDrafts.length > 0 && (
                <p className="text-muted-foreground">No active draft.</p>
              )}
            </div>
        )}

          {completedDrafts.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Completed Drafts</h3>
              <div className="space-y-2">
                {completedDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="flex items-center justify-between rounded border border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium text-foreground">
                          {playerPoolLabel(draft.settings.player_type)} &middot; {draftTypeLabels[draft.type] || draft.type} &middot; {draft.season}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {draft.settings.rounds} rounds
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${draftStatusColors.complete}`}>
                        Complete
                      </span>
                      <Link
                        href={`/leagues/${leagueId}/draft?draftId=${draft.id}`}
                        className="rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-muted-hover"
                      >
                        View Results
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>)}
        </div>

        {/* Matchups Card */}
        <div className="rounded-lg bg-card p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Matchups</h2>
              {isCommissioner && (league.settings?.matchup_type ?? 0) === 0 && (
                <button
                  onClick={handleGenerateMatchups}
                  disabled={isGeneratingMatchups}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                >
                  {isGeneratingMatchups
                    ? 'Generating...'
                    : matchups.length > 0
                      ? 'Re-Randomize Schedule'
                      : 'Generate Schedule'}
                </button>
              )}
              {(league.settings?.matchup_type ?? 0) === 1 && (
                <div className="flex gap-2">
                  {isCommissioner && (
                    <button
                      onClick={() => setShowDerbySettings(true)}
                      className="rounded-lg bg-muted px-3 py-2 text-accent-foreground hover:bg-muted-hover"
                      title="Derby Settings"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                  )}
                  <Link
                    href={`/leagues/${leagueId}/matchup-derby`}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                  >
                    Enter Derby Room
                  </Link>
                </div>
              )}
            </div>

            {matchups.length > 0 ? (
              <div>
                {/* Week selector */}
                <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                  {Array.from(new Set(matchups.map((m) => m.week)))
                    .sort((a, b) => a - b)
                    .map((week) => (
                      <button
                        key={week}
                        onClick={() => setSelectedWeek(week)}
                        className={`rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap ${
                          selectedWeek === week
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-accent-foreground hover:bg-muted-hover'
                        }`}
                      >
                        Wk {week}
                      </button>
                    ))}
                </div>

                {/* Matchup pairings for selected week */}
                <div className="space-y-2">
                  {(() => {
                    const weekMatchups = matchups.filter(
                      (m) => m.week === selectedWeek && m.matchup_id > 0
                    );
                    const grouped: Record<number, Matchup[]> = {};
                    for (const m of weekMatchups) {
                      if (!grouped[m.matchup_id]) grouped[m.matchup_id] = [];
                      grouped[m.matchup_id].push(m);
                    }

                    const byes = matchups.filter(
                      (m) => m.week === selectedWeek && m.matchup_id === 0
                    );

                    const getRosterLabel = (rosterId: number) => {
                      const roster = rosters.find((r) => r.roster_id === rosterId);
                      if (roster?.owner_id) {
                        const member = members.find((m) => m.user_id === roster.owner_id);
                        return member?.display_name || member?.username || `Team ${rosterId}`;
                      }
                      return `Team ${rosterId}`;
                    };

                    return (
                      <>
                        {Object.values(grouped).map((pair) => (
                          <div
                            key={pair[0].id}
                            className="flex items-center justify-between rounded border border-border p-3"
                          >
                            <span className="font-medium text-foreground">
                              {getRosterLabel(pair[0].roster_id)}
                            </span>
                            <span className="text-sm text-disabled">vs</span>
                            <span className="font-medium text-foreground">
                              {pair[1] ? getRosterLabel(pair[1].roster_id) : 'BYE'}
                            </span>
                          </div>
                        ))}
                        {byes.map((bye) => (
                          <div
                            key={bye.id}
                            className="flex items-center justify-between rounded border border-border bg-surface p-3"
                          >
                            <span className="font-medium text-foreground">
                              {getRosterLabel(bye.roster_id)}
                            </span>
                            <span className="text-sm italic text-disabled">BYE</span>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <p className="py-4 text-center text-muted-foreground">
                {isCommissioner
                  ? (league.settings?.matchup_type ?? 0) === 1
                    ? 'No matchups yet. Enter the derby room to set the schedule.'
                    : 'No matchups generated yet. Click the button above to generate the schedule.'
                  : (league.settings?.matchup_type ?? 0) === 1
                    ? 'No matchups yet. Enter the derby room to set the schedule.'
                    : 'No matchups have been generated yet.'}
              </p>
            )}
          </div>

        {/* Trades Card - always visible for draft pick trading */}
        <Link
          href={`/leagues/${leagueId}/trades`}
          className="block w-full rounded-lg bg-card p-6 shadow hover:shadow-md transition-shadow text-left"
        >
          <div className="flex items-center gap-3 mb-2">
            <ArrowLeftRight className="h-5 w-5 text-link" />
            <h3 className="text-lg font-bold text-foreground">Trades</h3>
          </div>
          <p className="text-sm text-muted-foreground">Trade draft picks and manage trades with other teams</p>
        </Link>

        {/* Waivers & Activity Cards - only during/after season */}
        {(league.status === 'in_season' || league.status === 'complete') && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href={`/leagues/${leagueId}/waivers`}
              className="rounded-lg bg-card p-6 shadow hover:shadow-md transition-shadow text-left"
            >
              <div className="flex items-center gap-3 mb-2">
                <ClipboardList className="h-5 w-5 text-info-foreground" />
                <h3 className="text-lg font-bold text-foreground">Waivers</h3>
              </div>
              <p className="text-sm text-muted-foreground">Add free agents and manage waiver claims</p>
            </Link>

            <Link
              href={`/leagues/${leagueId}/transactions`}
              className="rounded-lg bg-card p-6 shadow hover:shadow-md transition-shadow text-left"
            >
              <div className="flex items-center gap-3 mb-2">
                <Activity className="h-5 w-5 text-success-foreground" />
                <h3 className="text-lg font-bold text-foreground">Activity</h3>
              </div>
              <p className="text-sm text-muted-foreground">View all trades, waivers, and roster moves</p>
            </Link>
          </div>
        )}

      </div>

      {/* Draft Settings Modal */}
      {editingDraftId && (() => {
        const editDraft = drafts.find((d) => d.id === editingDraftId);
        if (!editDraft) return null;
        const vetDraftIncludesRookiePicks = editDraft.settings.player_type === 1
          && drafts.some((d) => d.settings.player_type === 2 && d.settings.include_rookie_picks === 1);
        return (
          <DraftSettingsModal
            isOpen={true}
            onClose={() => setEditingDraftId(null)}
            draft={editDraft}
            onSave={(updates) => handleUpdateDraft(editDraft.id, updates)}
            vetDraftIncludesRookiePicks={vetDraftIncludesRookiePicks}
          />
        );
      })()}

      {/* Settings Modal */}
      {league && (
        <LeagueSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          league={league}
          members={members}
          onUpdate={handleUpdateLeague}
          onDelete={handleDeleteLeague}
          onLeagueRefresh={handleRefreshLeague}
          isOwner={isCommissioner}
        />
      )}

      {/* Derby Settings Modal */}
      {showDerbySettings && league && accessToken && (
        <MatchupDerbySettingsModal
          league={league}
          accessToken={accessToken}
          onClose={() => setShowDerbySettings(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['league', leagueId] })}
        />
      )}

      {/* Re-randomize Confirmation Dialog */}
      {reRandomizeDraftId && (() => {
        const reRandomizeDraft = drafts.find((d) => d.id === reRandomizeDraftId);
        return reRandomizeDraft ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="rounded-lg bg-card p-6 shadow-xl max-w-sm w-full">
              <h3 className="text-lg font-semibold text-foreground mb-2">Confirm Action</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Draft order is already set. Are you sure you want to re-randomize?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setReRandomizeDraftId(null)}
                  className="rounded-lg bg-muted-hover px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-muted-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setReRandomizeDraftId(null);
                    handleRandomizeDraftOrder(reRandomizeDraft);
                  }}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                >
                  Re-randomize
                </button>
              </div>
            </div>
          </div>
        ) : null;
      })()}
    </div>
  );
}
