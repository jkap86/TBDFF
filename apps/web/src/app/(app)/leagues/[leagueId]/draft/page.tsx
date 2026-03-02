'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useDraftRoom } from '@/features/drafts/hooks/useDraftRoom';
import { DraftBoard } from '@/features/drafts/components/DraftBoard';
import { AuctionBoard } from '@/features/drafts/components/AuctionBoard';
import { SlowAuctionBoard } from '@/features/drafts/components/SlowAuctionBoard';
import { SlowAuctionControls } from '@/features/drafts/components/SlowAuctionControls';
import { DraftSidebar } from '@/features/drafts/components/DraftSidebar';
import { DraftControls } from '@/features/drafts/components/DraftControls';
import { AuctionControls } from '@/features/drafts/components/AuctionControls';
import { DraftRoomSkeleton } from '@/features/drafts/components/DraftRoomSkeleton';

const draftTypeLabels: Record<string, string> = {
  snake: 'Snake',
  linear: 'Linear',
  '3rr': '3rd Round Reversal',
  auction: 'Auction',
  slow_auction: 'Slow Auction',
};

export default function DraftRoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const leagueId = params.leagueId as string;
  const draftId = searchParams.get('draftId') ?? undefined;

  const room = useDraftRoom(leagueId, draftId);
  const { draft, picks, members, rosters, queue, isLoading, error, user, accessToken } = room;
  const [isStarting, setIsStarting] = useState(false);

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
      isMyTurn: !!room.isMyTurn && !draft.metadata?.current_nomination && !room.isAutoPick,
      isPicking: room.isNominating,
      actionLabel: 'Nominate',
    } : room.isSlowAuction ? {
      onDraft: room.handleSlowNominate,
      isMyTurn: room.userRosterId !== undefined,
      isPicking: room.isNominating,
      actionLabel: 'Nominate',
    } : {
      onDraft: room.handleMakePick,
      isMyTurn: !!room.isMyTurn,
      isPicking: room.isPicking,
    }),
  };

  return (
    <div className="min-h-screen bg-surface p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-foreground">Draft Room</h1>
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
            <div className="text-sm text-muted-foreground">
              {draftTypeLabels[draft.type]} | {draft.settings.rounds} rounds | {
              room.isSlowAuction
                ? `$${draft.settings.budget} budget | ${Math.round((draft.settings.bid_window_seconds ?? 43200) / 3600)}h bid window`
                : room.isAuction
                  ? `$${draft.settings.budget} budget | ${draft.settings.offering_timer ?? 120}s offer / ${draft.settings.nomination_timer}s bid`
                  : `${draft.settings.pick_timer}s timer`
            }
            </div>
          </div>
        </div>

        {/* Pre-Draft Board */}
        {draft.status === 'pre_draft' && (
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              {room.isSlowAuction
                ? <SlowAuctionBoard
                    draft={draft}
                    lots={room.slowAuctionLots}
                    budgets={room.slowAuctionBudgets}
                    members={members}
                    picks={picks}
                    currentUserId={user?.id}
                    myRosterId={room.userRosterId}
                    accessToken={room.accessToken}
                    onSetMaxBid={room.handleSlowSetMaxBid}
                  />
                : room.isAuction
                  ? <AuctionBoard draft={draft} picks={picks} members={members} currentUserId={user?.id} />
                  : <DraftBoard draft={draft} picks={picks} members={members} rosters={rosters} currentUserId={user?.id} />
              }
            </div>
            <div className="w-80 shrink-0">
              <DraftSidebar {...sidebarProps} />
            </div>
          </div>
        )}

        {/* Auction Draft Board */}
        {draft.status === 'drafting' && room.isAuction && (
          <>
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
            />

            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <AuctionBoard draft={draft} picks={picks} members={members} currentUserId={user?.id} />
              </div>
              <div className="w-80 shrink-0">
                <DraftSidebar {...sidebarProps} />
              </div>
            </div>
          </>
        )}

        {/* Slow Auction Draft Board */}
        {draft.status === 'drafting' && room.isSlowAuction && (
          <>
            <SlowAuctionControls
              pickError={room.pickError}
              nominationStats={room.nominationStats}
            />

            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <SlowAuctionBoard
                  draft={draft}
                  lots={room.slowAuctionLots}
                  budgets={room.slowAuctionBudgets}
                  members={members}
                  picks={picks}
                  currentUserId={user?.id}
                  myRosterId={room.userRosterId}
                  accessToken={room.accessToken}
                  onSetMaxBid={room.handleSlowSetMaxBid}
                />
              </div>
              <div className="w-80 shrink-0">
                <DraftSidebar {...sidebarProps} />
              </div>
            </div>
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
            />

            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <DraftBoard draft={draft} picks={picks} members={members} rosters={rosters} currentUserId={user?.id} />
              </div>
              <div className="w-80 shrink-0">
                <DraftSidebar {...sidebarProps} />
              </div>
            </div>
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
                picks={picks}
                currentUserId={user?.id}
                myRosterId={room.userRosterId}
                accessToken={room.accessToken}
                onSetMaxBid={room.handleSlowSetMaxBid}
              />
            : room.isAuction
              ? <AuctionBoard draft={draft} picks={picks} members={members} currentUserId={user?.id} />
              : <DraftBoard draft={draft} picks={picks} members={members} rosters={rosters} currentUserId={user?.id} />
        )}

      </div>
    </div>
  );
}
