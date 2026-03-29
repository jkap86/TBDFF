'use client';

import { useMemo } from 'react';
import type { Draft, DraftPick, LeagueMember, Roster, RosterPosition } from '@/lib/api';

function getPositionColor(position: string | undefined): string {
  switch (position) {
    case 'QB': return 'rgba(239, 68, 68, 0.45)';
    case 'RB': return 'rgba(34, 197, 94, 0.45)';
    case 'WR': return 'rgba(59, 130, 246, 0.45)';
    case 'TE': return 'rgba(249, 115, 22, 0.45)';
    case 'K':  return 'rgba(168, 85, 247, 0.45)';
    case 'DEF': return 'rgba(234, 179, 8, 0.45)';
    default:   return 'transparent';
  }
}

function getPositionBorder(position: string | undefined): string {
  switch (position) {
    case 'QB': return 'rgba(239, 68, 68, 0.7)';
    case 'RB': return 'rgba(34, 197, 94, 0.7)';
    case 'WR': return 'rgba(59, 130, 246, 0.7)';
    case 'TE': return 'rgba(249, 115, 22, 0.7)';
    case 'K':  return 'rgba(168, 85, 247, 0.7)';
    case 'DEF': return 'rgba(234, 179, 8, 0.7)';
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
  rosters: Roster[];
  currentUserId: string | undefined;
  rosterPositions: RosterPosition[];
}

export function AuctionBoard({ draft, picks, members, rosters, currentUserId, rosterPositions }: AuctionBoardProps) {
  const nomination = draft.metadata?.current_nomination as Record<string, any> | undefined;
  const budgets: Record<string, number> = draft.metadata?.auction_budgets ?? {};
  const completedPicks = picks.filter((p) => p.player_id);

  // Build slot -> userId from draft_order (which maps userId -> slot)
  const slotToUserId: Record<number, string> = {};
  for (const [userId, slot] of Object.entries(draft.draft_order ?? {}) as [string, number][]) {
    slotToUserId[slot] = userId;
  }

  // Build roster_id -> team name and roster_id -> userId mappings
  const rosterToUser: Record<number, string> = {};
  const rosterToUserId: Record<number, string> = {};
  for (const [slotStr, rosterId] of Object.entries(draft.slot_to_roster_id ?? {})) {
    const slot = Number(slotStr);
    const userId = slotToUserId[slot];
    let member = userId ? members.find((m) => m.user_id === userId) : null;
    if (!member) {
      const roster = rosters.find((r) => r.roster_id === rosterId);
      member = roster?.owner_id ? (members.find((m) => m.user_id === roster.owner_id) ?? null) : null;
    }
    rosterToUser[rosterId] = member?.display_name || member?.username || `Slot ${slot}`;
    const resolvedUserId = userId || (rosters.find((r) => r.roster_id === rosterId)?.owner_id ?? '');
    if (resolvedUserId) rosterToUserId[rosterId] = resolvedUserId;
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

  // Teams sorted by draft slot (nomination order) — includes unfilled slots
  const teamsInOrder = useMemo(() => {
    const draftOrder = draft.draft_order ?? {};
    const slotToUserIdLocal: Record<number, string> = {};
    for (const [userId, slot] of Object.entries(draftOrder) as [string, number][]) {
      slotToUserIdLocal[slot] = userId;
    }
    return Object.entries(draft.slot_to_roster_id ?? {})
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([slotStr, rosterId]) => {
        const slot = Number(slotStr);
        const userId = slotToUserIdLocal[slot] ?? '';
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
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {/* Active Nomination Panel / Waiting State */}
      {nomination ? (
        <div className="shrink-0 rounded-lg border border-border bg-card p-5 shadow-lg min-h-[120px]" style={{ borderLeft: '3px solid var(--color-primary)', background: 'var(--background)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-heading font-bold uppercase tracking-widest text-primary">Current Nomination</h3>
            <span className="text-xs font-heading font-bold uppercase tracking-wide text-muted-foreground">by {nominatorName}</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <div className="text-xl font-heading font-bold text-foreground tracking-tight">
                {nomination.player_metadata?.full_name || nomination.player_id}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                {nomination.player_metadata?.position && (
                  <span className="rounded-full bg-primary/15 border border-primary/30 px-2 py-0.5 text-xs font-heading font-bold uppercase tracking-wide text-primary">
                    {nomination.player_metadata.position}
                  </span>
                )}
                {nomination.player_metadata?.team && (
                  <span className="text-xs font-heading font-bold uppercase tracking-wide text-muted-foreground">
                    {nomination.player_metadata.team}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-mono font-bold text-success-foreground tracking-tight">${nomination.current_bid}</div>
              <div className="text-xs font-heading font-bold uppercase tracking-wide text-muted-foreground">{currentBidderName}</div>
            </div>
          </div>

          {/* Bid History */}
          {nomination.bid_history && nomination.bid_history.length > 1 && (
            <div className="mt-3 border-t border-border pt-2.5">
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Bid History</div>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-sleek pb-1">
                {[...nomination.bid_history].reverse().map((bid: any, i: number) => {
                  const bidder = members.find((m) => m.user_id === bid.user_id);
                  return (
                    <span
                      key={i}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${
                        i === 0
                          ? 'bg-success/15 border border-success-foreground/30 text-success-foreground'
                          : 'bg-card border border-border text-muted-foreground'
                      }`}
                    >
                      {bidder?.display_name || bidder?.username || 'Unknown'}: <span className="font-mono">${bid.amount}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : draft.status === 'drafting' ? (
        <div className="shrink-0 rounded-lg border border-border p-5 shadow-lg text-center min-h-[120px] flex items-center justify-center" style={{ background: 'var(--background)' }}>
          <p className="text-xs font-heading font-bold uppercase tracking-widest text-muted-foreground">Waiting for nomination...</p>
        </div>
      ) : null}

      {/* Draft Board — teams as columns, roster positions as rows */}
      {rosterPositions.length > 0 && (
        <div className="flex-1 min-h-0 overflow-auto rounded-lg shadow-lg border border-border scrollbar-sleek" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="min-w-max w-full" style={{ borderSpacing: 0 }}>
            <thead>
              <tr>
                {/* Position column header */}
                <th
                  className="sticky top-0 left-0 z-30 border-b-2 border-r border-border px-3 py-2.5 text-xs font-heading font-bold text-foreground uppercase tracking-wider"
                  style={{ boxShadow: '2px 2px 4px rgba(0,0,0,0.2)', background: 'var(--background)' }}
                >
                  Pos
                </th>
                {teamsInOrder.map((team) => {
                  const budget = budgets[String(team.rosterId)] ?? draft.settings.budget;
                  const isCurrentUser = team.userId === currentUserId;
                  return (
                    <th
                      key={team.rosterId}
                      className={`sticky top-0 z-20 border-b-2 border-r border-border px-3 py-2.5 text-center whitespace-nowrap ${
                        isCurrentUser ? 'text-primary' : 'text-foreground'
                      }`}
                      style={{
                        background: isCurrentUser ? 'color-mix(in srgb, var(--primary) 10%, var(--background))' : 'var(--background)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                        ...(isCurrentUser ? { borderBottom: '2px solid var(--color-primary)' } : {}),
                      }}
                    >
                      <div className="text-xs font-heading font-bold truncate max-w-[100px]">
                        {rosterToUser[team.rosterId] || `Slot ${team.slot}`}
                      </div>
                      <div className={`text-xs font-bold ${budget > 0 ? 'text-success-foreground' : 'text-destructive-foreground'}`}>
                        ${budget}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rosterPositions.map((pos, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-muted/30 transition-colors">
                  {/* Position label */}
                  <td
                    className="sticky left-0 z-10 border-b border-r border-border px-3 py-1.5 text-center text-xs font-heading font-bold text-foreground whitespace-nowrap uppercase tracking-wide"
                    style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.15)', background: 'var(--background)' }}
                  >
                    {SLOT_LABELS[pos] ?? pos}
                  </td>
                  {teamsInOrder.map((team) => {
                    const pick = teamSlots[team.rosterId]?.[rowIdx] ?? null;
                    const isUserTeam = team.userId === currentUserId;
                    const posColor = pick ? getPositionColor(pick.metadata?.position) : undefined;
                    const posBorder = pick ? getPositionBorder(pick.metadata?.position) : undefined;
                    return (
                      <td
                        key={team.rosterId}
                        className={`border-b border-r border-border px-2 py-1.5 text-center w-[110px] min-w-[110px] max-w-[110px] h-[38px] transition-colors ${
                          isUserTeam && !pick ? 'bg-primary/5' : ''
                        }`}
                        style={{
                          background: posColor,
                        }}
                      >
                        {pick ? (
                          <div
                            className="leading-tight rounded px-1 py-0.5"
                            style={{
                              borderLeft: `3px solid ${posBorder}`,
                            }}
                          >
                            <div className="text-xs font-bold text-foreground truncate">
                              {pick.metadata?.first_name?.[0]}. {pick.metadata?.last_name || pick.player_id}
                            </div>
                            <div className="text-xs text-foreground/60">
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
