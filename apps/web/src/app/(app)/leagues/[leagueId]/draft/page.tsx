'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PanelRightOpen, X } from 'lucide-react';
import { useDraftRoom } from '@/features/drafts/hooks/useDraftRoom';
import { DraftBoard } from '@/features/drafts/components/DraftBoard';
import { AuctionBoard } from '@/features/drafts/components/AuctionBoard';
import { SlowAuctionBoard } from '@/features/drafts/components/SlowAuctionBoard';
import { SlowAuctionControls } from '@/features/drafts/components/SlowAuctionControls';
import { DraftSidebar } from '@/features/drafts/components/DraftSidebar';
import { DraftControls } from '@/features/drafts/components/DraftControls';
import { AuctionControls } from '@/features/drafts/components/AuctionControls';
import { DraftRoomSkeleton } from '@/features/drafts/components/DraftRoomSkeleton';

export default function DraftRoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const leagueId = params.leagueId as string;
  const draftId = searchParams.get('draftId') ?? undefined;

  const room = useDraftRoom(leagueId, draftId);
  const { draft, league, picks, members, rosters, queue, isLoading, error, user, accessToken } = room;
  const [isStarting, setIsStarting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (isLoading) {
    return <DraftRoomSkeleton />;
  }

  if (error || !draft) {
    return (
      <div className="min-h-screen bg-surface p-6">
        <div className="mx-auto max-w-6xl">
          <Link
            href={`/leagues/${leagueId}`}
            className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-accent-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to League
          </Link>
          <div className="rounded bg-destructive p-4 text-destructive-foreground">{error || 'Draft not found'}</div>
        </div>
      </div>
    );
  }

  const sidebarProps = {
    draftId: draft.id,
    draftedPlayerIds: room.draftedPlayerIds,
    queue,
    sidebarTab: room.sidebarTab,
    onTabChange: room.setSidebarTab,
    onAdd: room.handleAddToQueue,
    onReorder: room.handleReorderQueue,
    onRemove: room.handleRemoveFromQueue,
    onUpdateMaxBid: room.handleUpdateMaxBid,
    accessToken: accessToken!,
    isAuction: room.isAuction,
    budget: draft.settings.budget,
    teams: draft.settings.teams,
    includeRookiePicks: draft.settings.include_rookie_picks === 1,
    ...(room.isAuction ? {
      onDraft: room.handleNominate,
      isMyTurn: !!room.isMyTurn && !draft.metadata?.current_nomination && !room.isAutoPick && !room.isDraftStopped,
      isPicking: room.isNominating,
      actionLabel: 'Nominate',
    } : room.isSlowAuction ? {
      onDraft: room.handleSlowNominate,
      isMyTurn: room.userRosterId !== undefined,
      isPicking: room.isNominating,
      actionLabel: 'Nominate',
    } : {
      onDraft: room.handleMakePick,
      isMyTurn: !!room.isMyTurn && !room.isDraftStopped,
      isPicking: room.isPicking,
    }),
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-surface overflow-hidden">
      {/* Header - pinned at top */}
      <div className="shrink-0 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-foreground">Draft Room</h1>
            {draft.status !== 'pre_draft' && (
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${
                draft.status === 'complete'
                  ? 'bg-green-100 text-green-700'
                  : room.isDraftStopped
                    ? 'bg-red-100 text-red-700'
                    : room.isDraftPaused
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-blue-100 text-blue-700'
              }`}>
                {draft.status === 'complete' ? 'Complete' : room.isDraftStopped ? 'Stopped' : room.isDraftPaused ? 'Paused' : 'Live'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {draft.status === 'pre_draft' && room.isCommissioner && (
              <button
                onClick={async () => {
                  setIsStarting(true);
                  await room.handleStartDraft();
                  setIsStarting(false);
                }}
                disabled={isStarting}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isStarting ? 'Starting...' : 'Start Draft'}
              </button>
            )}
            {draft.status !== 'complete' && (
              <button
                onClick={() => setDrawerOpen(true)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted flex items-center gap-2"
              >
                <PanelRightOpen className="h-4 w-4" />
                Players
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Auction Controls — pinned below header during live auction */}
      {draft.status === 'drafting' && room.isAuction && (
        <div className="shrink-0 px-4 pt-4">
          <AuctionControls
            draft={draft}
            timeRemaining={room.timeRemaining}
            formatTime={room.formatTime}
            userSlot={room.userSlot}
            isMyTurn={!!room.isMyTurn}
            isAutoPick={room.isAutoPick}
            isTogglingAutoPick={room.isTogglingAutoPick}
            nominateAmount={room.nominateAmount}
            setNominateAmount={room.setNominateAmount}
            bidAmount={room.bidAmount}
            setBidAmount={room.setBidAmount}
            isBidding={room.isBidding}
            pickError={room.pickError}
            queue={queue}
            onBid={room.handleBid}
            onToggleAutoPick={room.handleToggleAutoPick}
            onNominationMaxBid={room.handleNominationMaxBid}
            isCommissioner={room.isCommissioner}
            clockState={room.clockState}
            onPause={room.handlePauseDraft}
            onStop={room.handleStopDraft}
          />
        </div>
      )}

      {/* Board content — fills remaining space */}
      <div className={`flex-1 min-h-0 flex flex-col p-4 gap-4 ${
        draft.status === 'drafting' && room.isAuction ? '' : 'overflow-y-auto scrollbar-sleek'
      }`}>
        {/* Pre-Draft Board */}
        {draft.status === 'pre_draft' && (
          room.isSlowAuction
            ? <SlowAuctionBoard
                draft={draft}
                lots={room.slowAuctionLots}
                budgets={room.slowAuctionBudgets}
                members={members}
                rosters={rosters}
                picks={picks}
                currentUserId={user?.id}
                myRosterId={room.userRosterId}
                accessToken={room.accessToken}
                onSetMaxBid={room.handleSlowSetMaxBid}
              />
            : room.isAuction
              ? <AuctionBoard draft={draft} picks={picks} members={members} rosters={rosters} currentUserId={user?.id} rosterPositions={league?.roster_positions ?? []} />
              : <DraftBoard draft={draft} picks={picks} members={members} rosters={rosters} currentUserId={user?.id} />
        )}

        {/* Auction Draft Board */}
        {draft.status === 'drafting' && room.isAuction && (
          <AuctionBoard draft={draft} picks={picks} members={members} rosters={rosters} currentUserId={user?.id} rosterPositions={league?.roster_positions ?? []} />
        )}

        {/* Slow Auction Draft Board */}
        {draft.status === 'drafting' && room.isSlowAuction && (
          <>
            <SlowAuctionControls
              pickError={room.pickError}
              nominationStats={room.nominationStats}
            />
            <SlowAuctionBoard
              draft={draft}
              lots={room.slowAuctionLots}
              budgets={room.slowAuctionBudgets}
              members={members}
              rosters={rosters}
              picks={picks}
              currentUserId={user?.id}
              myRosterId={room.userRosterId}
              accessToken={room.accessToken}
              onSetMaxBid={room.handleSlowSetMaxBid}
            />
          </>
        )}

        {/* Standard Draft Board (snake/linear/3rr) */}
        {draft.status === 'drafting' && !room.isAuction && !room.isSlowAuction && (
          <>
            <DraftControls
              timeRemaining={room.timeRemaining}
              formatTime={room.formatTime}
              userSlot={room.userSlot}
              isMyTurn={!!room.isMyTurn}
              isAutoPick={room.isAutoPick}
              isTogglingAutoPick={room.isTogglingAutoPick}
              nextPick={room.nextPick}
              pickError={room.pickError}
              onToggleAutoPick={room.handleToggleAutoPick}
              isCommissioner={room.isCommissioner}
              clockState={room.clockState}
              onPause={room.handlePauseDraft}
              onStop={room.handleStopDraft}
            />
            <DraftBoard draft={draft} picks={picks} members={members} rosters={rosters} currentUserId={user?.id} />
          </>
        )}

        {/* Complete State */}
        {draft.status === 'complete' && picks.length > 0 && (
          room.isSlowAuction
            ? <SlowAuctionBoard
                draft={draft}
                lots={room.slowAuctionLots}
                budgets={room.slowAuctionBudgets}
                members={members}
                rosters={rosters}
                picks={picks}
                currentUserId={user?.id}
                myRosterId={room.userRosterId}
                accessToken={room.accessToken}
                onSetMaxBid={room.handleSlowSetMaxBid}
              />
            : room.isAuction
              ? <AuctionBoard draft={draft} picks={picks} members={members} rosters={rosters} currentUserId={user?.id} rosterPositions={league?.roster_positions ?? []} />
              : <DraftBoard draft={draft} picks={picks} members={members} rosters={rosters} currentUserId={user?.id} />
        )}
      </div>

      {/* Players/Queue Side Drawer */}
      {draft.status !== 'complete' && (
        <div className={`fixed top-0 right-0 z-50 h-full w-96 bg-card shadow-2xl border-l border-border transition-transform duration-300 ease-in-out ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Players & Queue</h2>
            <button
              onClick={() => setDrawerOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="h-[calc(100%-49px)]">
            <DraftSidebar {...sidebarProps} height="100%" />
          </div>
        </div>
      )}
    </div>
  );
}
