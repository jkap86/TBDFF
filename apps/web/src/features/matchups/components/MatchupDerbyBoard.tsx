'use client';

import { useMemo } from 'react';
import type { MatchupDerbyState, MatchupDerbyPick, LeagueMember, Roster } from '@tbdff/shared';
import { Check } from 'lucide-react';

interface MatchupDerbyBoardProps {
  derby: MatchupDerbyState;
  members: LeagueMember[];
  rosters: Roster[];
  totalWeeks: number;
  timeRemaining: number | null;
  isMyTurn: boolean;
  currentPickerUserId: string | null;
  isPicking: boolean;
  pickError: string | null;
  isCommissioner: boolean;
  userId: string;
  onMakePick: (opponentRosterId: number, week: number) => void;
  onAutoPick: () => void;
  formatTime: (seconds: number) => string;
}

export function MatchupDerbyBoard({
  derby,
  members,
  rosters,
  totalWeeks,
  timeRemaining,
  isMyTurn,
  currentPickerUserId,
  isPicking,
  pickError,
  isCommissioner,
  userId,
  onMakePick,
  onAutoPick,
  formatTime,
}: MatchupDerbyBoardProps) {
  const rosterLabels = useMemo(() => {
    const labels: Record<number, string> = {};
    for (const roster of rosters) {
      if (roster.owner_id) {
        const member = members.find((m) => m.user_id === roster.owner_id);
        labels[roster.roster_id] = member?.display_name || member?.username || `Team ${roster.roster_id}`;
      } else {
        labels[roster.roster_id] = `Team ${roster.roster_id}`;
      }
    }
    return labels;
  }, [rosters, members]);

  // Get the current picker's roster ID
  const currentPickerRosterId = useMemo(() => {
    if (!currentPickerUserId) return null;
    const entry = derby.derby_order.find((e) => e.user_id === currentPickerUserId);
    return entry?.roster_id ?? null;
  }, [currentPickerUserId, derby.derby_order]);

  // My roster ID
  const myRosterId = useMemo(() => {
    const entry = derby.derby_order.find((e) => e.user_id === userId);
    return entry?.roster_id ?? null;
  }, [userId, derby.derby_order]);

  // Determine picking roster (who's actually picking)
  const pickingRosterId = isMyTurn && myRosterId ? myRosterId : currentPickerRosterId;

  // Build occupancy maps for constraint checking
  const { weekOccupancy, cyclePairings } = useMemo(() => {
    const occ = new Map<string, number>(); // `${rosterId}:${week}` -> opponent
    const pairs = new Set<string>(); // `${min}:${max}:${cycleIdx}`

    const teamCount = derby.derby_order.length;
    const cycleLength = teamCount % 2 === 0 ? teamCount - 1 : teamCount;

    for (const pick of derby.picks) {
      occ.set(`${pick.picker_roster_id}:${pick.week}`, pick.opponent_roster_id);
      occ.set(`${pick.opponent_roster_id}:${pick.week}`, pick.picker_roster_id);

      const min = Math.min(pick.picker_roster_id, pick.opponent_roster_id);
      const max = Math.max(pick.picker_roster_id, pick.opponent_roster_id);
      const cycleIdx = Math.floor((pick.week - 1) / cycleLength);
      pairs.add(`${min}:${max}:${cycleIdx}`);
    }

    return { weekOccupancy: occ, cyclePairings: pairs };
  }, [derby.picks, derby.derby_order.length]);

  // Get available cells for the current picker
  const availableCells = useMemo(() => {
    if (!pickingRosterId || derby.status !== 'active') return new Set<string>();

    const available = new Set<string>();
    const teamCount = derby.derby_order.length;
    const cycleLength = teamCount % 2 === 0 ? teamCount - 1 : teamCount;
    const derbyRosterIds = derby.derby_order.map((e) => e.roster_id);

    for (let week = 1; week <= totalWeeks; week++) {
      if (weekOccupancy.has(`${pickingRosterId}:${week}`)) continue;

      const cycleIdx = Math.floor((week - 1) / cycleLength);

      for (const opponentId of derbyRosterIds) {
        if (opponentId === pickingRosterId) continue;
        if (weekOccupancy.has(`${opponentId}:${week}`)) continue;

        const min = Math.min(pickingRosterId, opponentId);
        const max = Math.max(pickingRosterId, opponentId);
        if (cyclePairings.has(`${min}:${max}:${cycleIdx}`)) continue;

        available.add(`${week}:${opponentId}`);
      }
    }

    return available;
  }, [pickingRosterId, derby.status, derby.derby_order, totalWeeks, weekOccupancy, cyclePairings]);

  // Determine which picks the user has already made
  const userPickCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of derby.derby_order) {
      const count = derby.picks.filter(
        (p) => p.user_id === entry.user_id
      ).length;
      counts.set(entry.user_id, count);
    }
    return counts;
  }, [derby.picks, derby.derby_order]);

  // Get opponent label for a cell
  const getCellContent = (week: number, rosterId: number): { opponent: string | null; isPicked: boolean } => {
    const opponentId = weekOccupancy.get(`${rosterId}:${week}`);
    if (opponentId !== undefined) {
      return { opponent: rosterLabels[opponentId] ?? `Team ${opponentId}`, isPicked: true };
    }
    return { opponent: null, isPicked: false };
  };

  const derbyRosterIds = derby.derby_order.map((e) => e.roster_id);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      {/* Left Column: Pick Order */}
      <div className="w-full lg:w-64 shrink-0">
        <div className="rounded-lg bg-card p-4 shadow">
          {/* Timer */}
          {derby.status === 'active' && timeRemaining !== null && (
            <div className={`mb-4 text-center text-2xl font-bold ${timeRemaining <= 10 ? 'text-red-500 animate-pulse' : 'text-foreground'}`}>
              {formatTime(timeRemaining)}
            </div>
          )}

          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pick Order</h3>
          <div className="space-y-1.5">
            {derby.derby_order.map((entry, idx) => {
              const isCurrent = entry.user_id === currentPickerUserId;
              const isSkipped = derby.skipped_users.includes(entry.user_id);
              const picks = userPickCount.get(entry.user_id) ?? 0;

              return (
                <div
                  key={entry.user_id}
                  className={`flex items-center gap-2 rounded px-3 py-2 text-sm ${
                    isCurrent
                      ? 'bg-primary text-primary-foreground font-medium'
                      : isSkipped
                        ? 'bg-yellow-500/20 text-yellow-600'
                        : 'text-accent-foreground'
                  }`}
                >
                  <span className="w-5 text-center font-mono text-xs opacity-60">{idx + 1}</span>
                  <span className="flex-1 truncate">{entry.username}</span>
                  {isCurrent && (
                    <span className="shrink-0 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-xs font-medium">
                      Picking
                    </span>
                  )}
                  {isSkipped && (
                    <span className="shrink-0 rounded bg-yellow-500/30 px-1.5 py-0.5 text-xs font-medium">
                      Skipped
                    </span>
                  )}
                  {picks > 0 && !isCurrent && (
                    <span className="shrink-0 text-xs opacity-50">{picks} picks</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Commissioner controls */}
          {isCommissioner && derby.status === 'active' && (
            <div className="mt-4 border-t border-border pt-3">
              <button
                onClick={onAutoPick}
                className="w-full rounded bg-muted px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-muted-hover"
              >
                Force Auto-Pick
              </button>
            </div>
          )}

          {/* Progress */}
          <div className="mt-4 border-t border-border pt-3">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{derby.picks.length} / {derby.total_picks}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${derby.total_picks > 0 ? (derby.picks.length / derby.total_picks) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Week x Opponent Grid */}
      <div className="flex-1 min-w-0">
        <div className="rounded-lg bg-card p-4 shadow">
          {pickError && (
            <div className="mb-3 rounded bg-destructive p-2 text-sm text-destructive-foreground">{pickError}</div>
          )}

          {isMyTurn && derby.status === 'active' && (
            <div className="mb-3 rounded bg-primary/10 p-2 text-sm text-primary font-medium text-center">
              It&apos;s your turn! Select an opponent and week.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-b border-border">
                    Week
                  </th>
                  {derbyRosterIds.map((rosterId) => (
                    <th
                      key={rosterId}
                      className={`px-3 py-2 text-center text-xs font-semibold border-b border-border whitespace-nowrap ${
                        rosterId === pickingRosterId ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {rosterLabels[rosterId] ?? `Team ${rosterId}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((week) => (
                  <tr key={week} className="border-b border-border/50 last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-accent-foreground whitespace-nowrap">
                      Wk {week}
                    </td>
                    {derbyRosterIds.map((rosterId) => {
                      const cell = getCellContent(week, rosterId);
                      const isAvailable = availableCells.has(`${week}:${rosterId}`) && isMyTurn && rosterId !== pickingRosterId;
                      const isPickerColumn = rosterId === pickingRosterId;

                      if (isPickerColumn) {
                        // Show the picker's assigned opponent for this week (if any)
                        return (
                          <td key={rosterId} className="px-2 py-1.5 text-center">
                            {cell.isPicked ? (
                              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs text-primary">
                                <Check className="h-3 w-3" />
                                {cell.opponent}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      }

                      return (
                        <td key={rosterId} className="px-2 py-1.5 text-center">
                          {cell.isPicked ? (
                            <span className="inline-block rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                              vs {cell.opponent}
                            </span>
                          ) : isAvailable ? (
                            <button
                              onClick={() => onMakePick(rosterId, week)}
                              disabled={isPicking}
                              className="w-full rounded border border-primary/30 bg-primary/5 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/15 disabled:opacity-50 transition-colors"
                            >
                              Select
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
