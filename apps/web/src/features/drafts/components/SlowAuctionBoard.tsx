'use client';

import { useState, useEffect } from 'react';
import type { AuctionLot, RosterBudget, LeagueMember, Draft, DraftPick } from '@/lib/api';
import { SlowBidDialog } from './SlowBidDialog';

interface SlowAuctionBoardProps {
  draft: Draft;
  lots: AuctionLot[];
  budgets: RosterBudget[];
  members: LeagueMember[];
  picks: DraftPick[];
  currentUserId: string | undefined;
  myRosterId: number | undefined;
  onSetMaxBid: (lotId: string, maxBid: number) => Promise<void>;
}

function useCountdown(lots: AuctionLot[]) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (deadline: string) => {
    const ms = new Date(deadline).getTime() - now;
    if (ms <= 0) return 'Expired';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((ms % (1000 * 60)) / 1000);
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };
}

export function SlowAuctionBoard({
  draft,
  lots,
  budgets,
  members,
  picks,
  currentUserId,
  myRosterId,
  onSetMaxBid,
}: SlowAuctionBoardProps) {
  const [bidDialogLot, setBidDialogLot] = useState<AuctionLot | null>(null);
  const formatCountdown = useCountdown(lots);

  // Build roster_id -> display name mapping
  const rosterToUser: Record<number, string> = {};
  const rosterToUserId: Record<number, string> = {};
  for (const [userId, slot] of Object.entries(draft.draft_order ?? {}) as [string, number][]) {
    const rosterId = (draft.slot_to_roster_id ?? {})[String(slot)];
    const member = members.find((m) => m.user_id === userId);
    rosterToUser[rosterId] = member?.display_name || member?.username || `Team ${rosterId}`;
    rosterToUserId[rosterId] = userId;
  }

  const myBudget = budgets.find((b) => b.roster_id === myRosterId) ?? null;

  const activeLots = lots.filter((l) => l.status === 'active').sort(
    (a, b) => new Date(a.bid_deadline).getTime() - new Date(b.bid_deadline).getTime()
  );

  const completedPicks = picks.filter((p) => p.player_id).sort((a, b) => b.pick_no - a.pick_no);

  return (
    <div className="space-y-4">
      {/* Active Lots */}
      <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
          Active Lots ({activeLots.length})
        </h3>
        {activeLots.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No active nominations. Use the nominate button to start one.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeLots.map((lot) => {
              const isMyBid = lot.current_bidder_roster_id === myRosterId;
              const iHaveBid = lot.my_max_bid != null;
              const isEndingSoon = new Date(lot.bid_deadline).getTime() - Date.now() < 3600000;

              return (
                <div
                  key={lot.id}
                  className={`rounded-lg border p-3 transition-colors ${
                    isMyBid
                      ? 'border-green-300 bg-green-50 dark:bg-green-900/20'
                      : iHaveBid
                        ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {/* Player info */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white text-sm">
                        {(lot.player_metadata?.full_name as string) || lot.player_id}
                      </div>
                      {!!lot.player_metadata?.position && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {String(lot.player_metadata.position)} - {String(lot.player_metadata.team)}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Nom: {rosterToUser[lot.nominator_roster_id] || `Team ${lot.nominator_roster_id}`}
                      </div>
                    </div>
                    <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      isEndingSoon ? 'bg-red-100 text-red-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}>
                      {formatCountdown(lot.bid_deadline)}
                    </div>
                  </div>

                  {/* Bid info */}
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-xl font-bold text-green-700">${lot.current_bid}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {lot.current_bidder_roster_id
                          ? rosterToUser[lot.current_bidder_roster_id] || `Team ${lot.current_bidder_roster_id}`
                          : 'No bids'}
                        {lot.bid_count > 0 && ` (${lot.bid_count} bid${lot.bid_count !== 1 ? 's' : ''})`}
                      </div>
                    </div>
                    {iHaveBid && (
                      <div className={`text-right text-xs ${isMyBid ? 'text-green-600' : 'text-orange-600'}`}>
                        <div>My max: ${lot.my_max_bid}</div>
                        <div className="font-medium">{isMyBid ? 'Winning' : 'Outbid'}</div>
                      </div>
                    )}
                  </div>

                  {/* Bid button */}
                  {myRosterId !== undefined && (
                    <button
                      type="button"
                      onClick={() => setBidDialogLot(lot)}
                      className={`w-full rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        isMyBid
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {iHaveBid ? 'Update Max Bid' : 'Place Bid'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Team Budgets */}
      {budgets.length > 0 && (
        <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Team Budgets</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {budgets
              .sort((a, b) => b.available - a.available)
              .map((budget) => {
                const isCurrentUser = rosterToUserId[budget.roster_id] === currentUserId;
                return (
                  <div
                    key={budget.roster_id}
                    className={`rounded-lg border p-2 text-center ${
                      isCurrentUser
                        ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate">
                      {budget.username}
                    </div>
                    <div className={`text-lg font-bold ${budget.available > 0 ? 'text-green-700' : 'text-red-600 dark:text-red-400'}`}>
                      ${budget.available}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">
                      {budget.won_count}/{budget.total_slots} | ${budget.spent} spent
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Completed Picks */}
      {completedPicks.length > 0 && (
        <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
            Won Players ({completedPicks.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Player</th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Pos</th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Team</th>
                  <th className="pb-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Amount</th>
                </tr>
              </thead>
              <tbody>
                {completedPicks.map((pick, idx) => {
                  const isUserPick = rosterToUserId[pick.roster_id] === currentUserId;
                  return (
                    <tr
                      key={pick.id}
                      className={`border-b border-gray-100 dark:border-gray-700 ${isUserPick ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}
                    >
                      <td className="py-1.5 text-xs text-gray-400 dark:text-gray-500">{completedPicks.length - idx}</td>
                      <td className="py-1.5">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {pick.metadata?.full_name || pick.player_id}
                        </span>
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                          {rosterToUser[pick.roster_id]}
                        </span>
                      </td>
                      <td className="py-1.5 text-xs text-gray-600 dark:text-gray-400">
                        {pick.metadata?.position}
                      </td>
                      <td className="py-1.5 text-xs text-gray-600 dark:text-gray-400">
                        {pick.metadata?.team}
                      </td>
                      <td className="py-1.5 text-right text-sm font-bold text-green-700">
                        ${pick.amount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bid Dialog */}
      {bidDialogLot && (
        <SlowBidDialog
          lot={bidDialogLot}
          myBudget={myBudget}
          minBid={draft.settings.min_bid ?? 1}
          minIncrement={draft.settings.min_increment ?? 1}
          onSubmit={onSetMaxBid}
          onClose={() => setBidDialogLot(null)}
        />
      )}
    </div>
  );
}
