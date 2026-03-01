'use client';

import type { Draft, DraftPick, LeagueMember } from '@/lib/api';

interface AuctionBoardProps {
  draft: Draft;
  picks: DraftPick[];
  members: LeagueMember[];
  currentUserId: string | undefined;
}

export function AuctionBoard({ draft, picks, members, currentUserId }: AuctionBoardProps) {
  const nomination = draft.metadata?.current_nomination as Record<string, any> | undefined;
  const budgets: Record<string, number> = draft.metadata?.auction_budgets ?? {};
  const completedPicks = picks.filter((p) => p.player_id).sort((a, b) => b.pick_no - a.pick_no);

  // Build roster_id -> team name and roster_id -> userId mappings
  const rosterToUser: Record<number, string> = {};
  const rosterToUserId: Record<number, string> = {};
  for (const [userId, slot] of Object.entries(draft.draft_order ?? {}) as [string, number][]) {
    const rosterId = (draft.slot_to_roster_id ?? {})[String(slot)];
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
        <div className="rounded-lg bg-card p-5 shadow border-l-4 border-yellow-400">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-foreground">Current Nomination</h3>
            <span className="text-xs text-muted-foreground">Nominated by {nominatorName}</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <div className="text-xl font-bold text-foreground">
                {nomination.player_metadata?.full_name || nomination.player_id}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {nomination.player_metadata?.position && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-accent-foreground">
                    {nomination.player_metadata.position}
                  </span>
                )}
                {nomination.player_metadata?.team && (
                  <span className="text-sm text-muted-foreground">
                    {nomination.player_metadata.team}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-success-foreground">${nomination.current_bid}</div>
              <div className="text-sm text-muted-foreground">{currentBidderName}</div>
            </div>
          </div>

          {/* Bid History */}
          {nomination.bid_history && nomination.bid_history.length > 1 && (
            <div className="mt-3 border-t border-border pt-2">
              <div className="text-xs font-medium text-muted-foreground mb-1">Bid History</div>
              <div className="flex flex-wrap gap-2">
                {[...nomination.bid_history].reverse().map((bid: any, i: number) => {
                  const bidder = members.find((m) => m.user_id === bid.user_id);
                  return (
                    <span key={i} className={`rounded px-2 py-0.5 text-xs ${i === 0 ? 'bg-success text-success-foreground font-medium' : 'bg-muted text-muted-foreground'}`}>
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
        <div className="rounded-lg bg-card p-5 shadow text-center">
          <p className="text-muted-foreground">Waiting for nomination...</p>
        </div>
      )}

      {/* Team Budgets Grid */}
      <div className="rounded-lg bg-card p-4 shadow">
        <h3 className="text-sm font-bold text-accent-foreground mb-3">Team Budgets</h3>
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
                      ? 'border-highlight-ring bg-highlight'
                      : isCurrentUser
                        ? 'border-primary/30 bg-primary/10'
                        : 'border-border'
                  }`}
                >
                  <div className="text-xs font-medium text-muted-foreground truncate">
                    {rosterToUser[Number(rosterId)] || `Team ${rosterId}`}
                  </div>
                  <div className={`text-lg font-bold ${budget > 0 ? 'text-success-foreground' : 'text-destructive-foreground'}`}>
                    ${budget}
                  </div>
                  <div className="text-[10px] text-disabled">
                    {teamPicks[Number(rosterId)]?.length ?? 0}/{draft.settings.rounds} picks
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Completed Picks */}
      <div className="rounded-lg bg-card p-4 shadow">
        <h3 className="text-sm font-bold text-accent-foreground mb-3">
          Completed Picks ({completedPicks.length})
        </h3>
        {completedPicks.length === 0 ? (
          <p className="text-sm text-disabled">No picks yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left text-xs font-medium text-muted-foreground">#</th>
                  <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Player</th>
                  <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Pos</th>
                  <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Team</th>
                  <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {completedPicks.map((pick, idx) => {
                  const isUserPick = rosterToUserId[pick.roster_id] === currentUserId;
                  return (
                    <tr
                      key={pick.id}
                      className={`border-b border-border ${isUserPick ? 'bg-primary/10' : ''}`}
                    >
                      <td className="py-1.5 text-xs text-disabled">{completedPicks.length - idx}</td>
                      <td className="py-1.5">
                        <span className="text-sm font-medium text-foreground">
                          {pick.metadata?.full_name || pick.player_id}
                        </span>
                        <span className="ml-2 text-xs text-disabled">
                          {rosterToUser[pick.roster_id]}
                        </span>
                      </td>
                      <td className="py-1.5 text-xs text-muted-foreground">
                        {pick.metadata?.position}
                      </td>
                      <td className="py-1.5 text-xs text-muted-foreground">
                        {pick.metadata?.team}
                      </td>
                      <td className="py-1.5 text-right text-sm font-bold text-success-foreground">
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
