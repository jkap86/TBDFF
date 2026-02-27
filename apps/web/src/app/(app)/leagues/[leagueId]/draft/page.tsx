'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useDraftRoom } from '@/features/drafts/hooks/useDraftRoom';
import { DraftBoard } from '@/features/drafts/components/DraftBoard';
import { AuctionBoard } from '@/features/drafts/components/AuctionBoard';
import { SlowAuctionBoard } from '@/features/drafts/components/SlowAuctionBoard';
import { SlowAuctionControls } from '@/features/drafts/components/SlowAuctionControls';
import { DraftSettingsForm } from '@/features/drafts/components/DraftSettingsForm';
import { DraftSidebar } from '@/features/drafts/components/DraftSidebar';
import { DraftControls } from '@/features/drafts/components/DraftControls';
import { AuctionControls } from '@/features/drafts/components/AuctionControls';

const draftTypeLabels: Record<string, string> = {
  snake: 'Snake',
  linear: 'Linear',
  '3rr': '3rd Round Reversal',
  auction: 'Auction',
  slow_auction: 'Slow Auction',
};

export default function DraftRoomPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;

  const room = useDraftRoom(leagueId);
  const { draft, picks, members, rosters, queue, isLoading, error, user, accessToken } = room;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading draft...</div>
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="mx-auto max-w-6xl">
          <button
            onClick={() => router.push(`/leagues/${leagueId}`)}
            className="mb-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ArrowLeft className="h-4 w-4" /> Back to League
          </button>
          <div className="rounded bg-red-50 dark:bg-red-900/30 p-4 text-red-600 dark:text-red-400">{error || 'Draft not found'}</div>
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Draft Room</h1>
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
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {draftTypeLabels[draft.type]} | {draft.settings.rounds} rounds | {
              room.isSlowAuction
                ? `$${draft.settings.budget} budget | ${Math.round((draft.settings.bid_window_seconds ?? 43200) / 3600)}h bid window`
                : room.isAuction
                  ? `$${draft.settings.budget} budget | ${draft.settings.offering_timer ?? 120}s offer / ${draft.settings.nomination_timer}s bid`
                  : `${draft.settings.pick_timer}s timer`
            }
          </div>
        </div>

        {/* Pre-Draft Setup */}
        {draft.status === 'pre_draft' && room.isCommissioner && (
          <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
            <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">Draft Setup</h2>
            <div className="space-y-6">
              <DraftSettingsForm draft={draft} onSave={room.handleUpdateSettings} readOnly={false} />

              {!room.isSlowAuction && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                    Draft Order: {Object.keys(draft.draft_order ?? {}).length > 0
                      ? `${Object.keys(draft.draft_order ?? {}).length} slots assigned`
                      : 'Not set'}
                  </p>
                  <button
                    onClick={room.handleSetOrder}
                    className="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
                  >
                    {Object.keys(draft.draft_order ?? {}).length > 0 ? 'Reset Draft Order' : 'Set Draft Order'}
                  </button>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Auto-assigns order based on roster slot assignments
                  </p>
                </div>
              )}

              {(room.isSlowAuction || Object.keys(draft.draft_order ?? {}).length > 0) && (
                <div>
                  <button
                    onClick={room.handleStartDraft}
                    className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Start Draft
                  </button>
                </div>
              )}
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
              {room.userSlot !== undefined && (
                <div className="w-80 shrink-0">
                  <DraftSidebar {...sidebarProps} />
                </div>
              )}
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
                  onSetMaxBid={room.handleSlowSetMaxBid}
                />
              </div>
              {room.userSlot !== undefined && (
                <div className="w-80 shrink-0">
                  <DraftSidebar {...sidebarProps} />
                </div>
              )}
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
                <DraftBoard draft={draft} picks={picks} members={members} currentUserId={user?.id} />
              </div>
              {room.userSlot !== undefined && (
                <div className="w-80 shrink-0">
                  <DraftSidebar {...sidebarProps} />
                </div>
              )}
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
                onSetMaxBid={room.handleSlowSetMaxBid}
              />
            : room.isAuction
              ? <AuctionBoard draft={draft} picks={picks} members={members} currentUserId={user?.id} />
              : <DraftBoard draft={draft} picks={picks} members={members} currentUserId={user?.id} />
        )}

        {/* Pre-draft queue + settings */}
        {draft.status === 'pre_draft' && !room.isCommissioner && (
          <div className="space-y-4">
            <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
              <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">Draft Settings</h2>
              <DraftSettingsForm draft={draft} onSave={async () => {}} readOnly={true} />
              <p className="mt-4 text-center text-sm text-gray-400 dark:text-gray-500">
                Waiting for the commissioner to start the draft.
              </p>
            </div>
            {room.userSlot !== undefined && (
              <DraftSidebar {...sidebarProps} height="calc(100vh - 400px)" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
