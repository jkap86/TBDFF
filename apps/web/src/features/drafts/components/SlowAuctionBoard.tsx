'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { AuctionLot, AuctionBidHistoryEntry, RosterBudget, LeagueMember, Roster, Draft, DraftPick } from '@/lib/api';
import { draftApi } from '@/lib/api';
import { SlowBidDialog } from './SlowBidDialog';

interface SlowAuctionBoardProps {
  draft: Draft;
  lots: AuctionLot[];
  budgets: RosterBudget[];
  members: LeagueMember[];
  rosters: Roster[];
  picks: DraftPick[];
  currentUserId: string | undefined;
  myRosterId: number | undefined;
  accessToken: string | null;
  onSetMaxBid: (lotId: string, maxBid: number) => Promise<void>;
}

function useCountdown() {
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
  rosters,
  picks,
  currentUserId,
  myRosterId,
  accessToken,
  onSetMaxBid,
}: SlowAuctionBoardProps) {
  const [bidDialogLot, setBidDialogLot] = useState<AuctionLot | null>(null);
  const [expandedLotId, setExpandedLotId] = useState<string | null>(null);
  const [bidHistory, setBidHistory] = useState<AuctionBidHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [budgetsExpanded, setBudgetsExpanded] = useState(false);
  const formatCountdown = useCountdown();

  // Build roster_id -> display name mapping
  const rosterToUser: Record<number, string> = {};
  const rosterToUserId: Record<number, string> = {};
  for (const [userId, slot] of Object.entries(draft.draft_order ?? {}) as [string, number][]) {
    const rosterId = (draft.slot_to_roster_id ?? {})[String(slot)];
    if (rosterId === undefined) continue;
    const member = members.find((m) => m.user_id === userId);
    rosterToUser[rosterId] = member?.display_name || member?.username || `Team ${rosterId}`;
    rosterToUserId[rosterId] = userId;
  }
  // Fallback: fill in any rosters missing from draft_order using roster owner_id
  for (const roster of rosters) {
    if (rosterToUser[roster.roster_id] === undefined && roster.owner_id) {
      const member = members.find((m) => m.user_id === roster.owner_id);
      if (member) {
        rosterToUser[roster.roster_id] = member.display_name || member.username;
        rosterToUserId[roster.roster_id] = roster.owner_id;
      }
    }
  }

  const myBudget = budgets.find((b) => b.roster_id === myRosterId) ?? null;

  const toggleBidHistory = async (lotId: string) => {
    if (expandedLotId === lotId) {
      setExpandedLotId(null);
      setBidHistory([]);
      return;
    }
    setExpandedLotId(lotId);
    setBidHistory([]);
    if (!accessToken) return;
    setHistoryLoading(true);
    try {
      const result = await draftApi.getSlowAuctionLotHistory(draft.id, lotId, accessToken);
      setExpandedLotId((current) => {
        if (current === lotId) setBidHistory(result.history);
        return current;
      });
    } catch {
      // Non-critical
    } finally {
      setHistoryLoading(false);
    }
  };

  const formatHistoryTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const renderBidHistory = () => {
    if (historyLoading) {
      return <div className="text-xs text-disabled py-2">Loading bid history...</div>;
    }
    if (bidHistory.length === 0) {
      return <div className="text-xs text-disabled py-2">No bid history</div>;
    }
    return (
      <div className="space-y-1 pt-2">
        {bidHistory.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-accent-foreground">
                {rosterToUser[entry.roster_id] || entry.username || `Team ${entry.roster_id}`}
              </span>
              {entry.is_proxy && (
                <span className="text-xs px-1 rounded bg-info text-info-foreground">
                  auto
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-success-foreground">${entry.bid_amount}</span>
              <span className="text-disabled">{formatHistoryTime(entry.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const activeLots = lots.filter((l) => l.status === 'active').sort(
    (a, b) => new Date(a.bid_deadline).getTime() - new Date(b.bid_deadline).getTime()
  );

  const completedPicks = picks.filter((p) => p.player_id).sort((a, b) => b.pick_no - a.pick_no);

  return (
    <div className="space-y-4 pb-12">
      {/* Active Lots */}
      <div className="rounded-lg border border-border bg-card p-4 shadow">
        <h3 className="text-sm font-heading font-bold uppercase tracking-wide text-accent-foreground mb-3">
          Active Lots ({activeLots.length})
        </h3>
        {activeLots.length === 0 ? (
          <p className="text-sm text-disabled">No active nominations. Use the nominate button to start one.</p>
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
                      ? 'border-success-foreground/30 bg-success'
                      : iHaveBid
                        ? 'border-highlight-ring bg-highlight'
                        : 'border-border'
                  }`}
                >
                  {/* Player info */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium text-foreground text-sm">
                        {(lot.player_metadata?.full_name as string) || lot.player_id}
                      </div>
                      {!!lot.player_metadata?.position && (
                        <div className="text-xs text-muted-foreground">
                          {String(lot.player_metadata.position)} - {String(lot.player_metadata.team)}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Nom: {rosterToUser[lot.nominator_roster_id] || `Team ${lot.nominator_roster_id}`}
                      </div>
                    </div>
                    <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      isEndingSoon ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {formatCountdown(lot.bid_deadline)}
                    </div>
                  </div>

                  {/* Bid info */}
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-xl font-bold text-success-foreground">${lot.current_bid}</div>
                      <div className="text-xs text-muted-foreground">
                        {lot.current_bidder_roster_id
                          ? rosterToUser[lot.current_bidder_roster_id] || `Team ${lot.current_bidder_roster_id}`
                          : 'No bids'}
                        {lot.bid_count > 0 && ` (${lot.bid_count} bid${lot.bid_count !== 1 ? 's' : ''})`}
                      </div>
                    </div>
                    {iHaveBid && (
                      <div className={`text-right text-xs ${isMyBid ? 'text-success-foreground' : 'text-neon-orange'}`}>
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
                          ? 'bg-success text-success-foreground hover:bg-success/80'
                          : 'bg-primary text-primary-foreground hover:bg-primary-hover glow-primary'
                      }`}
                    >
                      {iHaveBid ? 'Update Max Bid' : 'Place Bid'}
                    </button>
                  )}

                  {/* Bid history toggle */}
                  {lot.bid_count > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleBidHistory(lot.id)}
                        className="w-full flex items-center justify-center gap-1 mt-2 pt-2 border-t border-border text-xs text-muted-foreground hover:text-accent-foreground transition-colors"
                      >
                        Bid History
                        {expandedLotId === lot.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {expandedLotId === lot.id && renderBidHistory()}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Team Budgets — sticky bottom panel */}
      {budgets.length > 0 && (
        <div className="sticky bottom-0 rounded-lg border border-border bg-card/95 shadow-xl ring-1 ring-border backdrop-blur-md">
          <button
            type="button"
            onClick={() => setBudgetsExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/50 transition-colors rounded-lg"
          >
            <h3 className="text-sm font-heading font-bold uppercase tracking-wide text-accent-foreground">
              Team Budgets
            </h3>
            {budgetsExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
          </button>
          {budgetsExpanded && (
            <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {budgets
                .sort((a, b) => b.available - a.available)
                .map((budget) => {
                  const isCurrentUser = rosterToUserId[budget.roster_id] === currentUserId;
                  const activeNomCount = activeLots.filter(
                    (l) => l.nominator_roster_id === budget.roster_id
                  ).length;
                  const winningCount = activeLots.filter(
                    (l) => l.current_bidder_roster_id === budget.roster_id
                  ).length;
                  const committedPlayers = budget.won_count + winningCount;
                  const committedSpend = budget.spent + budget.leading_commitment;
                  return (
                    <div
                      key={budget.roster_id}
                      className={`rounded-lg border p-2 text-center ${
                        isCurrentUser
                          ? 'border-primary/30 bg-primary/10'
                          : 'border-border'
                      }`}
                    >
                      <div className="text-xs font-medium text-foreground truncate">
                        {budget.username}
                      </div>
                      <div className={`text-lg font-bold ${budget.available > 0 ? 'text-success-foreground' : 'text-destructive-foreground'}`}>
                        ${budget.available}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {activeNomCount} active nom{activeNomCount !== 1 ? 's' : ''}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {committedPlayers}/{budget.total_slots} | ${committedSpend} spent
                      </div>
                      <div className="text-xs text-disabled">
                        {budget.won_count}/{budget.total_slots} | ${budget.spent} won
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Completed Picks */}
      {completedPicks.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 shadow">
          <h3 className="text-sm font-heading font-bold uppercase tracking-wide text-accent-foreground mb-3">
            Won Players ({completedPicks.length})
          </h3>
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
                  const lotId = pick.metadata?.lot_id as string | undefined;
                  const isExpanded = lotId != null && expandedLotId === lotId;
                  return (
                    <tr
                      key={pick.id}
                      className={`border-b border-border ${isUserPick ? 'bg-primary/10' : ''}`}
                    >
                      <td className="py-1.5 text-xs text-disabled">
                        {lotId ? (
                          <button
                            type="button"
                            onClick={() => toggleBidHistory(lotId)}
                            className="flex items-center gap-0.5 hover:text-accent-foreground transition-colors"
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {completedPicks.length - idx}
                          </button>
                        ) : (
                          completedPicks.length - idx
                        )}
                      </td>
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
                }).flatMap((row, idx) => {
                  const pick = completedPicks[idx];
                  const lotId = pick.metadata?.lot_id as string | undefined;
                  if (lotId && expandedLotId === lotId) {
                    return [row, (
                      <tr key={`${pick.id}-history`} className="bg-surface">
                        <td colSpan={5} className="px-4 py-2">
                          {renderBidHistory()}
                        </td>
                      </tr>
                    )];
                  }
                  return [row];
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
