'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, MessageSquare, ArrowLeftRight, ClipboardList, Activity, ChevronDown, Trophy, Users2 } from 'lucide-react';
import { leagueApi, draftApi, matchupApi, ApiError, type UpdateLeagueRequest, type Draft, type Matchup } from '@/lib/api';
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
  const error = leagueError ? (leagueError as Error).message : null;

  // --- UI state ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDraftSettingsOpen, setIsDraftSettingsOpen] = useState(false);
  const [showReRandomizeConfirm, setShowReRandomizeConfirm] = useState(false);
  const [isDraftOrderExpanded, setIsDraftOrderExpanded] = useState(false);
  const [isDerbyResultsExpanded, setIsDerbyResultsExpanded] = useState(false);
  const [shuffleDisplay, setShuffleDisplay] = useState<{ lockedCount: number; displayUserIds: string[] } | null>(null);
  const shuffleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [isStartingDerby, setIsStartingDerby] = useState(false);
  const [isGeneratingMatchups, setIsGeneratingMatchups] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [isScoringExpanded, setIsScoringExpanded] = useState(false);
  const [isRosterExpanded, setIsRosterExpanded] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
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

  const handleCreateDraft = async () => {
    if (!accessToken) return;

    try {
      setIsCreatingDraft(true);
      setMutationError(null);
      const result = await draftApi.create(leagueId, {}, accessToken);
      updateDraftsCache((prev) => [result.draft, ...prev]);
    } catch (err) {
      if (err instanceof ApiError) {
        setMutationError(err.message);
      }
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const handleUpdateDraft = async (updates: import('@/lib/api').UpdateDraftRequest) => {
    if (!accessToken || !activeDraft) return;

    const result = await draftApi.update(activeDraft.id, updates, accessToken);
    updateDraftsCache((prev) => prev.map((d) => (d.id === result.draft.id ? result.draft : d)));
  };

  const handleRandomizeDraftOrder = async () => {
    if (!accessToken || !activeDraft) return;

    try {
      const assignedRosters = rosters.filter((r) => r.owner_id);

      // Fisher-Yates shuffle
      for (let i = assignedRosters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [assignedRosters[i], assignedRosters[j]] = [assignedRosters[j], assignedRosters[i]];
      }

      const draftOrder: Record<string, number> = {};
      const slotToRosterId: Record<string, number> = {};

      assignedRosters.forEach((roster, index) => {
        const slot = index + 1;
        draftOrder[roster.owner_id!] = slot;
        slotToRosterId[String(slot)] = roster.roster_id;
      });

      const result = await draftApi.setOrder(activeDraft.id, { draft_order: draftOrder, slot_to_roster_id: slotToRosterId }, accessToken);
      updateDraftsCache((prev) => prev.map((d) => (d.id === result.draft.id ? result.draft : d)));
      setIsDraftOrderExpanded(true);

      // Start shuffle animation
      const finalEntries = Object.entries(result.draft.draft_order).sort(([, a], [, b]) => a - b);
      const totalSlots = finalEntries.length;
      const participantUserIds = finalEntries.map(([uid]) => uid);

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

        const lockedPart = finalEntries.slice(0, newLockedCount).map(([uid]) => uid);
        const unlocked = participantUserIds.filter((uid) => !lockedPart.includes(uid));

        for (let i = unlocked.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [unlocked[i], unlocked[j]] = [unlocked[j], unlocked[i]];
        }

        setShuffleDisplay({ lockedCount: newLockedCount, displayUserIds: [...lockedPart, ...unlocked] });

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

  const handleStartDerby = async () => {
    if (!accessToken || !activeDraft) return;

    try {
      setIsStartingDerby(true);
      setMutationError(null);
      const result = await draftApi.startDerby(activeDraft.id, accessToken);
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

  // Find the active draft (pre_draft or drafting)
  const activeDraft = drafts.find((d) => d.status === 'pre_draft' || d.status === 'drafting');
  const completedDrafts = drafts.filter((d) => d.status === 'complete');

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

        {/* Draft Card */}
        <div className="rounded-lg bg-card p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Draft</h2>
            {activeDraft && (
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${draftStatusColors[activeDraft.status]}`}>
                {draftStatusLabels[activeDraft.status]}
              </span>
            )}
          </div>

          {activeDraft ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium text-foreground">{draftTypeLabels[activeDraft.type] || activeDraft.type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Rounds</p>
                  <p className="font-medium text-foreground">{activeDraft.settings.rounds}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pick Timer</p>
                  <p className="font-medium text-foreground">{activeDraft.settings.pick_timer}s</p>
                </div>
              </div>

              <div className="flex gap-3">
                {activeDraft.status === 'drafting' && (
                  <Link
                    href={`/leagues/${leagueId}/draft`}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                  >
                    Enter Draft Room
                  </Link>
                )}
                {activeDraft.status === 'pre_draft' && (
                  <>
                    {isCommissioner && (
                      <button
                        onClick={() => setIsDraftSettingsOpen(true)}
                        className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-secondary-hover flex items-center gap-2"
                      >
                        <Settings className="h-4 w-4" />
                        Draft Settings
                      </button>
                    )}
                    {isCommissioner && activeDraft.type !== 'slow_auction' && !(activeDraft.metadata?.derby as any)?.status && (
                      <button
                        onClick={() => {
                          const hasOrder = Object.keys(activeDraft.draft_order ?? {}).length > 0;
                          if (hasOrder) {
                            setShowReRandomizeConfirm(true);
                            return;
                          }
                          handleRandomizeDraftOrder();
                        }}
                        disabled={shuffleDisplay !== null}
                        className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-secondary-hover disabled:opacity-50"
                      >
                        {(activeDraft.metadata?.order_method ?? 'randomize') === 'derby'
                          ? (Object.keys(activeDraft.draft_order ?? {}).length > 0 ? 'Re-randomize Derby Order' : 'Randomize Derby Order')
                          : (Object.keys(activeDraft.draft_order ?? {}).length > 0 ? 'Re-randomize Draft Order' : 'Randomize Draft Order')}
                      </button>
                    )}
                    {isCommissioner && (activeDraft.metadata?.order_method ?? 'randomize') === 'derby'
                      && Object.keys(activeDraft.draft_order ?? {}).length > 0
                      && !(activeDraft.metadata?.derby as any)?.status && (
                      <button
                        onClick={handleStartDerby}
                        disabled={isStartingDerby}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {isStartingDerby ? 'Starting...' : 'Start Derby'}
                      </button>
                    )}
                    <Link
                      href={`/leagues/${leagueId}/draft`}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                    >
                      Enter Draft Room
                    </Link>
                  </>
                )}
              </div>

              {/* Derby Pick Board — shown when derby is active */}
              {(activeDraft.metadata?.derby as any)?.status === 'active' && (
                <DerbyPickBoard
                  draft={activeDraft}
                  members={members}
                  userId={user?.id}
                  isCommissioner={isCommissioner}
                  accessToken={accessToken!}
                  onDraftUpdated={handleDraftUpdated}
                />
              )}

              {/* Derby Results — collapsible, shown after derby completes */}
              {(activeDraft.metadata?.derby as any)?.status === 'complete' && (() => {
                const derby = activeDraft.metadata?.derby as any;
                return (
                  <div className="rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setIsDerbyResultsExpanded(!isDerbyResultsExpanded)}
                      className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
                    >
                      <span>Derby Results ({derby.picks.length} picks)</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${isDerbyResultsExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {isDerbyResultsExpanded && (
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

              {(activeDraft.metadata?.derby as any)?.status !== 'active' && (Object.keys(activeDraft.draft_order ?? {}).length > 0 || shuffleDisplay) && (
                <div className="rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setIsDraftOrderExpanded(!isDraftOrderExpanded)}
                    className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
                  >
                    <span>Draft Order ({Object.keys(activeDraft.draft_order ?? {}).length} teams)</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${isDraftOrderExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isDraftOrderExpanded && (
                    <div className="border-t border-border px-4 py-3">
                      <ol className="space-y-1">
                        {(shuffleDisplay
                          ? shuffleDisplay.displayUserIds.map((userId, index) => ({
                              userId,
                              slot: index + 1,
                              isLocked: index < shuffleDisplay.lockedCount,
                            }))
                          : Object.entries(activeDraft.draft_order)
                              .sort(([, a], [, b]) => a - b)
                              .map(([userId, slot]) => ({ userId, slot, isLocked: true }))
                        ).map(({ userId, slot, isLocked }) => {
                          const member = members.find((m) => m.user_id === userId);
                          return (
                            <li
                              key={`slot-${slot}`}
                              className={`flex items-center gap-2 text-sm transition-colors duration-150 ${
                                isLocked
                                  ? 'text-foreground font-medium'
                                  : 'text-disabled'
                              }`}
                            >
                              <span className="w-6 text-right font-medium text-muted-foreground">{slot}.</span>
                              <span>{member?.display_name || member?.username || 'Unknown'}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              {completedDrafts.length === 0 && (
                <p className="mb-3 text-muted-foreground">No draft has been created yet.</p>
              )}
              {completedDrafts.length > 0 && (
                <p className="mb-3 text-muted-foreground">No active draft.</p>
              )}
              {isCommissioner && (
                <button
                  onClick={handleCreateDraft}
                  disabled={isCreatingDraft}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                >
                  {isCreatingDraft ? 'Creating...' : 'Create Draft'}
                </button>
              )}
            </div>
          )}

          {completedDrafts.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
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
                          {draftTypeLabels[draft.type] || draft.type} &middot; {draft.season}
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
                        href={`/leagues/${leagueId}/draft`}
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
        </div>

        {/* Matchups Card */}
        {(league.status === 'in_season' || league.status === 'complete') && (
          <div className="rounded-lg bg-card p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Matchups</h2>
              {isCommissioner && league.status === 'in_season' && (
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
                  ? 'No matchups generated yet. Click the button above to generate the schedule.'
                  : 'No matchups have been generated yet.'}
              </p>
            )}
          </div>
        )}

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

        {/* Members List */}
        <div className="rounded-lg bg-card p-6 shadow">
          <h2 className="mb-4 text-xl font-bold text-foreground">
            Members ({members.length}/{league.total_rosters})
          </h2>

          <div className="space-y-2">
            {members.map((member) => (
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
                  {member.user_id !== user?.id && (
                    <button
                      onClick={() => handleStartDM(member.user_id)}
                      className="rounded p-1.5 text-disabled hover:bg-muted hover:text-link"
                      title={`Message ${member.username}`}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </button>
                  )}
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium uppercase ${roleColors[member.role]}`}
                  >
                    {member.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Draft Settings Modal */}
      {activeDraft && (
        <DraftSettingsModal
          isOpen={isDraftSettingsOpen}
          onClose={() => setIsDraftSettingsOpen(false)}
          draft={activeDraft}
          onSave={handleUpdateDraft}
        />
      )}

      {/* Settings Modal */}
      {league && (
        <LeagueSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          league={league}
          members={members}
          rosters={rosters}
          onUpdate={handleUpdateLeague}
          onDelete={handleDeleteLeague}
          onAssignRoster={handleAssignRoster}
          onUnassignRoster={handleUnassignRoster}
          onLeagueRefresh={handleRefreshLeague}
          isOwner={isCommissioner}
        />
      )}

      {/* Re-randomize Confirmation Dialog */}
      {showReRandomizeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg bg-card p-6 shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-semibold text-foreground mb-2">Confirm Action</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Draft order is already set. Are you sure you want to re-randomize?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowReRandomizeConfirm(false)}
                className="rounded-lg bg-muted-hover px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-muted-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowReRandomizeConfirm(false);
                  handleRandomizeDraftOrder();
                }}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
              >
                Re-randomize
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
