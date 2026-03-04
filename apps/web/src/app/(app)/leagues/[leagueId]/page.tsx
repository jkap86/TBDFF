'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { leagueApi, draftApi, matchupApi, paymentApi, ApiError, type UpdateLeagueRequest, type Draft, type Matchup } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { LeagueSettingsModal } from '@/features/leagues/components/LeagueSettingsModal';
import { DraftSettingsModal } from '@/features/drafts/components/DraftSettingsModal';
import { useConversations } from '@/features/chat/hooks/useConversations';
import { useChatPanel } from '@/features/chat/context/ChatPanelContext';
import { useSocket } from '@/features/chat/context/SocketProvider';
import { LeagueDetailSkeleton } from '@/features/leagues/components/LeagueDetailSkeleton';
import { useLeagueQuery, useMembersQuery, useRostersQuery } from '@/hooks/useLeagueQueries';
import { MatchupDerbySettingsModal } from '@/features/matchups/components/MatchupDerbySettingsModal';
import { useDraftOrderShuffle } from '@/features/drafts/hooks/useDraftOrderShuffle';
import { LeagueHeaderCard } from '@/features/leagues/components/LeagueHeaderCard';
import { LeagueDuesCard } from '@/features/leagues/components/LeagueDuesCard';
import { LeagueDraftsCard } from '@/features/leagues/components/LeagueDraftsCard';
import { LeagueMatchupsCard } from '@/features/leagues/components/LeagueMatchupsCard';
import { LeagueLinkCards } from '@/features/leagues/components/LeagueLinkCards';

export default function LeagueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();

  // --- Data queries ---
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
  const [showDerbySettings, setShowDerbySettings] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const { startConversation } = useConversations();
  const { openConversation } = useChatPanel();
  const { socket } = useSocket();

  // --- Computed ---
  const currentUserMember = members.find((m) => m.user_id === user?.id);
  const isCommissioner = currentUserMember?.role === 'commissioner';
  const activeDrafts = drafts
    .filter((d) => d.status === 'pre_draft' || d.status === 'drafting')
    .sort((a, b) => b.settings.player_type - a.settings.player_type);
  const completedDrafts = drafts.filter((d) => d.status === 'complete');

  // --- Cache helpers ---
  const updateDraftsCache = useCallback((updater: (prev: Draft[]) => Draft[]) => {
    queryClient.setQueryData(['drafts', leagueId], (old: any) => {
      if (!old) return old;
      return { ...old, drafts: updater(old.drafts) };
    });
  }, [queryClient, leagueId]);

  // --- Shuffle hook ---
  const { shuffleDisplay, handleRandomizeDraftOrder } = useDraftOrderShuffle({
    rosters,
    accessToken,
    updateDraftsCache,
    setMutationError,
  });

  // --- Handlers ---
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

  const handleUpdateDraft = async (draftId: string, updates: import('@/lib/api').UpdateDraftRequest) => {
    if (!accessToken) return;
    const result = await draftApi.update(draftId, updates, accessToken);
    updateDraftsCache((prev) => prev.map((d) => (d.id === result.draft.id ? result.draft : d)));
  };

  const handleStartDerby = async (draft: Draft) => {
    if (!accessToken) return;
    try {
      setMutationError(null);
      const result = await draftApi.startDerby(draft.id, accessToken);
      updateDraftsCache((prev) => prev.map((d) => (d.id === result.draft.id ? result.draft : d)));
    } catch (err) {
      if (err instanceof ApiError) {
        setMutationError(err.message);
      }
    }
  };

  const handleDraftUpdated = useCallback((updatedDraft: Draft) => {
    updateDraftsCache((prev) => prev.map((d) => (d.id === updatedDraft.id ? updatedDraft : d)));
  }, [updateDraftsCache]);

  const handleStartDM = async (memberId: string) => {
    try {
      const conversation = await startConversation(memberId);
      openConversation(conversation);
    } catch {
      // Non-fatal
    }
  };

  const handleRefreshLeague = async () => {
    queryClient.invalidateQueries({ queryKey: ['league', leagueId] });
  };

  // --- Socket subscription for real-time derby updates ---
  const activeDraftForDerby = drafts.find((d) => d.status === 'pre_draft' || d.status === 'drafting');
  const derbyStatus = (activeDraftForDerby?.metadata?.derby as any)?.status;

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

  // --- Render ---
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

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <LeagueHeaderCard
          league={league}
          isCommissioner={isCommissioner}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        <LeagueDuesCard
          league={league}
          members={members}
          rosters={rosters}
          payments={payments}
          leagueId={leagueId}
          currentUserId={user?.id}
          isCommissioner={isCommissioner}
          accessToken={accessToken}
          onStartDM={handleStartDM}
          onAssignRoster={handleAssignRoster}
        />

        <LeagueDraftsCard
          league={league}
          leagueId={leagueId}
          drafts={drafts}
          activeDrafts={activeDrafts}
          completedDrafts={completedDrafts}
          members={members}
          rosters={rosters}
          isCommissioner={isCommissioner}
          currentUserId={user?.id}
          accessToken={accessToken}
          shuffleDisplay={shuffleDisplay}
          mutationError={mutationError}
          onRandomizeDraftOrder={handleRandomizeDraftOrder}
          onStartDerby={handleStartDerby}
          onEditDraft={setEditingDraftId}
          onDraftUpdated={handleDraftUpdated}
        />

        <LeagueMatchupsCard
          league={league}
          leagueId={leagueId}
          matchups={matchups}
          members={members}
          rosters={rosters}
          isCommissioner={isCommissioner}
          accessToken={accessToken}
          onOpenDerbySettings={() => setShowDerbySettings(true)}
        />

        <LeagueLinkCards
          leagueId={leagueId}
          leagueStatus={league.status}
        />
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
    </div>
  );
}
