'use client';

import { useMemo } from 'react';
import type { Draft, DraftPick, LeagueMember, RosterPosition } from '@/lib/api';

function getPositionColor(position: string | undefined): string {
  switch (position) {
    case 'QB': return 'rgba(239, 68, 68, 0.25)';
    case 'RB': return 'rgba(34, 197, 94, 0.25)';
    case 'WR': return 'rgba(59, 130, 246, 0.25)';
    case 'TE': return 'rgba(249, 115, 22, 0.25)';
    case 'K':  return 'rgba(168, 85, 247, 0.25)';
    case 'DEF': return 'rgba(161, 98, 7, 0.25)';
    default:   return 'transparent';
  }
}

const FLEX_ELIGIBILITY: Record<string, string[]> = {
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['WR', 'RB'],
};

function canFillSlot(slot: RosterPosition, playerPosition: string): boolean {
  if (slot === playerPosition) return true;
  if (slot === 'BN' || slot === 'IR') return true;
  return FLEX_ELIGIBILITY[slot]?.includes(playerPosition) ?? false;
}

/** Assign a team's picks into roster position slots, most specific slots first. */
function assignPicksToSlots(
  teamPicks: DraftPick[],
  rosterPositions: RosterPosition[],
): (DraftPick | null)[] {
  const slots: (DraftPick | null)[] = new Array(rosterPositions.length).fill(null);
  const placed = new Set<string>();

  // Sort picks by amount descending so higher-value players get starter slots
  const sorted = [...teamPicks].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));

  // Pass 1: exact position matches (QB->QB, RB->RB, etc.) — skip flex/BN/IR
  for (const pick of sorted) {
    if (placed.has(pick.id)) continue;
    const pos = pick.metadata?.position as string | undefined;
    if (!pos) continue;
    for (let i = 0; i < rosterPositions.length; i++) {
      if (slots[i]) continue;
      const slot = rosterPositions[i];
      if (slot === pos) {
        slots[i] = pick;
        placed.add(pick.id);
        break;
      }
    }
  }

  // Pass 2: flex slots
  for (const pick of sorted) {
    if (placed.has(pick.id)) continue;
    const pos = pick.metadata?.position as string | undefined;
    if (!pos) continue;
    for (let i = 0; i < rosterPositions.length; i++) {
      if (slots[i]) continue;
      const slot = rosterPositions[i];
      if (slot !== 'BN' && slot !== 'IR' && slot !== pos && canFillSlot(slot, pos)) {
        slots[i] = pick;
        placed.add(pick.id);
        break;
      }
    }
  }

  // Pass 3: bench
  for (const pick of sorted) {
    if (placed.has(pick.id)) continue;
    for (let i = 0; i < rosterPositions.length; i++) {
      if (slots[i]) continue;
      const slot = rosterPositions[i];
      if (slot === 'BN') {
        slots[i] = pick;
        placed.add(pick.id);
        break;
      }
    }
  }

  // Pass 4: IR (fallback)
  for (const pick of sorted) {
    if (placed.has(pick.id)) continue;
    for (let i = 0; i < rosterPositions.length; i++) {
      if (slots[i]) continue;
      if (rosterPositions[i] === 'IR') {
        slots[i] = pick;
        placed.add(pick.id);
        break;
      }
    }
  }

  return slots;
}

const SLOT_LABELS: Record<string, string> = {
  SUPER_FLEX: 'SF',
  REC_FLEX: 'RF',
  WRRB_FLEX: 'W/R',
};

interface AuctionBoardProps {
  draft: Draft;
  picks: DraftPick[];
  members: LeagueMember[];
  currentUserId: string | undefined;
  rosterPositions: RosterPosition[];
}

export function AuctionBoard({ draft, picks, members, currentUserId, rosterPositions }: AuctionBoardProps) {
  const nomination = draft.metadata?.current_nomination as Record<string, any> | undefined;
  const budgets: Record<string, number> = draft.metadata?.auction_budgets ?? {};
  const completedPicks = picks.filter((p) => p.player_id);

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

  // Teams sorted by draft slot (nomination order)
  const teamsInOrder = useMemo(() => {
    return Object.entries(draft.draft_order ?? {})
      .sort(([, a], [, b]) => a - b)
      .map(([userId, slot]) => {
        const rosterId = (draft.slot_to_roster_id ?? {})[String(slot)];
        return { userId, slot, rosterId };
      });
  }, [draft.draft_order, draft.slot_to_roster_id]);

  // Build per-team pick lists
  const teamPicksMap = useMemo(() => {
    const map: Record<number, DraftPick[]> = {};
    for (const pick of completedPicks) {
      if (!map[pick.roster_id]) map[pick.roster_id] = [];
      map[pick.roster_id].push(pick);
    }
    return map;
  }, [completedPicks]);

  // Assign picks to roster slots for each team
  const teamSlots = useMemo(() => {
    const result: Record<number, (DraftPick | null)[]> = {};
    for (const team of teamsInOrder) {
      result[team.rosterId] = assignPicksToSlots(
        teamPicksMap[team.rosterId] ?? [],
        rosterPositions,
      );
    }
    return result;
  }, [teamsInOrder, teamPicksMap, rosterPositions]);

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

      {/* Draft Board — teams as columns, roster positions as rows */}
      {rosterPositions.length > 0 && (
        <div className="overflow-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="min-w-max" style={{ borderSpacing: 0 }}>
            <thead>
              <tr>
                {/* Position column header */}
                <th
                  className="sticky left-0 z-30 bg-muted border-b border-r border-border px-3 py-2 text-xs font-heading font-semibold text-muted-foreground"
                  style={{ boxShadow: '2px 2px 4px rgba(0,0,0,0.15)' }}
                >
                  Pos
                </th>
                {teamsInOrder.map((team) => {
                  const budget = budgets[String(team.rosterId)] ?? 0;
                  const isCurrentUser = team.userId === currentUserId;
                  return (
                    <th
                      key={team.rosterId}
                      className={`sticky top-0 z-20 border-b border-r border-border px-3 py-2 text-center whitespace-nowrap bg-muted ${
                        isCurrentUser ? 'text-primary' : 'text-muted-foreground'
                      }`}
                      style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                    >
                      <div className="text-xs font-heading font-semibold truncate max-w-[100px]">
                        {rosterToUser[team.rosterId] || `Team ${team.rosterId}`}
                      </div>
                      <div className={`text-[10px] font-bold ${budget > 0 ? 'text-success-foreground' : 'text-destructive-foreground'}`}>
                        ${budget}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rosterPositions.map((pos, rowIdx) => (
                <tr key={rowIdx}>
                  {/* Position label */}
                  <td
                    className="sticky left-0 z-10 border-b border-r border-border bg-muted px-3 py-1.5 text-center text-xs font-heading font-semibold text-muted-foreground whitespace-nowrap"
                    style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.1)', background: getPositionColor(pos) || undefined }}
                  >
                    {SLOT_LABELS[pos] ?? pos}
                  </td>
                  {teamsInOrder.map((team) => {
                    const pick = teamSlots[team.rosterId]?.[rowIdx] ?? null;
                    const isUserTeam = team.userId === currentUserId;
                    return (
                      <td
                        key={team.rosterId}
                        className={`border-b border-r border-border px-2 py-1.5 text-center min-w-[110px] ${
                          isUserTeam && !pick ? 'bg-primary/5' : ''
                        }`}
                        style={{
                          background: pick ? getPositionColor(pick.metadata?.position) : undefined,
                        }}
                      >
                        {pick ? (
                          <div className="leading-tight">
                            <div className="text-xs font-semibold text-foreground truncate">
                              {pick.metadata?.first_name?.[0]}. {pick.metadata?.last_name || pick.player_id}
                            </div>
                            <div className="text-[10px] text-disabled">
                              {pick.metadata?.position}{pick.metadata?.team ? ` - ${pick.metadata.team}` : ''}
                              {pick.amount != null ? ` · $${pick.amount}` : ''}
                            </div>
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
