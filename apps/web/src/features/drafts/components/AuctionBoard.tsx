'use client';

import type { Draft, DraftPick, LeagueMember } from '@/lib/api';

interface AuctionBoardProps {
  draft: Draft;
  picks: DraftPick[];
  members: LeagueMember[];
  currentUserId: string | undefined;
}

export function AuctionBoard({ draft, picks, members, currentUserId }: AuctionBoardProps) {
  const nomination = draft.metadata?.current_nomination;
  const budgets: Record<string, number> = draft.metadata?.auction_budgets ?? {};
  const completedPicks = picks.filter((p) => p.player_id).sort((a, b) => b.pick_no - a.pick_no);

  // Build roster_id -> team name and roster_id -> userId mappings
  const rosterToUser: Record<number, string> = {};
  const rosterToUserId: Record<number, string> = {};
  for (const [userId, slot] of Object.entries(draft.draft_order) as [string, number][]) {
    const rosterId = draft.slot_to_roster_id[String(slot)];
    const member = members.find((m) => m.user_id === userId);
    rosterToUser[rosterId] = member?.display_name || member?.username || `Team ${rosterId}`;
    rosterToUserId[rosterId] = userId;
  }

  // Find who the current bidder is
  const currentBidderName = nomination
    ? (() => {
        const member = members.find((m) => m.user_id === nomination.current_bidder);
        return member?.display_name || member?.username || 'Unknown';
      })()
    : null;

  // Find who nominated
  const nominatorName = nomination
    ? (() => {
        const member = members.find((m) => m.user_id === nomination.nominated_by);
        return member?.display_name || member?.username || 'Unknown';
      })()
    : null;

  // Build per-team pick lists for the roster view
  const teamPicks: Record<number, DraftPick[]> = {};
  for (const pick of completedPicks) {
    if (!teamPicks[pick.roster_id]) teamPicks[pick.roster_id] = [];
    teamPicks[pick.roster_id].push(pick);
  }

  return (
    <div className="space-y-4">
      {/* Active Nomination Panel */}
      {nomination && (
        <div className="rounded-lg bg-white dark:bg-gray-800 p-5 shadow border-l-4 border-yellow-400">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Current Nomination</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">Nominated by {nominatorName}</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {nomination.player_metadata?.full_name || nomination.player_id}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {nomination.player_metadata?.position && (
                  <span className="rounded bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                    {nomination.player_metadata.position}
                  </span>
                )}
                {nomination.player_metadata?.team && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {nomination.player_metadata.team}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-green-700">${nomination.current_bid}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{currentBidderName}</div>
            </div>
          </div>

          {/* Bid History */}
          {nomination.bid_history && nomination.bid_history.length > 1 && (
            <div className="mt-3 border-t dark:border-gray-700 pt-2">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bid History</div>
              <div className="flex flex-wrap gap-2">
                {[...nomination.bid_history].reverse().map((bid: any, i: number) => {
                  const bidder = members.find((m) => m.user_id === bid.user_id);
                  return (
                    <span key={i} className={`rounded px-2 py-0.5 text-xs ${i === 0 ? 'bg-green-100 text-green-800 font-medium' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                      {bidder?.display_name || bidder?.username || 'Unknown'}: ${bid.amount}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No active nomination message */}
      {!nomination && draft.status === 'drafting' && (
        <div className="rounded-lg bg-white dark:bg-gray-800 p-5 shadow text-center">
          <p className="text-gray-500 dark:text-gray-400">Waiting for nomination...</p>
        </div>
      )}

      {/* Team Budgets Grid */}
      <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Team Budgets</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {Object.entries(budgets)
            .sort(([, a], [, b]) => b - a)
            .map(([rosterId, budget]) => {
              const isCurrentUser = rosterToUserId[Number(rosterId)] === currentUserId;
              const isHighBidder = nomination?.bidder_roster_id === Number(rosterId);
              return (
                <div
                  key={rosterId}
                  className={`rounded-lg border p-2 text-center ${
                    isHighBidder
                      ? 'border-yellow-400 bg-yellow-50'
                      : isCurrentUser
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate">
                    {rosterToUser[Number(rosterId)] || `Team ${rosterId}`}
                  </div>
                  <div className={`text-lg font-bold ${budget > 0 ? 'text-green-700' : 'text-red-600 dark:text-red-400'}`}>
                    ${budget}
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">
                    {teamPicks[Number(rosterId)]?.length ?? 0}/{draft.settings.rounds} picks
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Completed Picks */}
      <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
          Completed Picks ({completedPicks.length})
        </h3>
        {completedPicks.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No picks yet</p>
        ) : (
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
                      className={`border-b border-gray-100 dark:border-gray-700 ${isUserPick ? 'bg-blue-50' : ''}`}
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
        )}
      </div>
    </div>
  );
}
