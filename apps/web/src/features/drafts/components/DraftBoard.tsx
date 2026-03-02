'use client';

import { useMemo } from 'react';
import type { Draft, DraftPick, LeagueMember, Roster } from '@/lib/api';

interface DraftBoardProps {
  draft: Draft;
  picks: DraftPick[];
  members: LeagueMember[];
  rosters: Roster[];
  currentUserId: string | undefined;
}

export function DraftBoard({ draft, picks, members, rosters, currentUserId }: DraftBoardProps) {
  const { settings, draft_order } = draft;
  const teams = settings.teams;
  const rounds = settings.rounds;

  // Build a grid: picks[round][slot] using a Map for O(1) lookups
  const grid = useMemo(() => {
    const pickMap = new Map<string, DraftPick>();
    for (const p of picks) {
      pickMap.set(`${p.round}-${p.draft_slot}`, p);
    }

    const result: (DraftPick | null)[][] = [];
    for (let r = 1; r <= rounds; r++) {
      const row: (DraftPick | null)[] = [];
      for (let s = 1; s <= teams; s++) {
        row.push(pickMap.get(`${r}-${s}`) ?? null);
      }
      result.push(row);
    }
    return result;
  }, [picks, rounds, teams]);

  // Find which slot the current user has
  const userSlot = currentUserId ? draft_order[currentUserId] : undefined;
  // Resolve current user's roster_id for trade-aware highlighting
  const userRosterId = userSlot !== undefined ? draft.slot_to_roster_id?.[String(userSlot)] : undefined;

  // Find the next pick
  const nextPick = picks.find((p) => !p.player_id);

  // Build slot -> username and slot -> userId mapping from slot_to_roster_id -> rosters -> members
  const slotToUser: Record<number, string> = {};
  const slotToUserId: Record<number, string> = {};
  const rosterIdToName: Record<number, string> = {};
  for (const [slotStr, rosterId] of Object.entries(draft.slot_to_roster_id ?? {})) {
    const slot = Number(slotStr);
    const roster = rosters.find((r) => r.roster_id === rosterId);
    const member = roster?.owner_id ? members.find((m) => m.user_id === roster.owner_id) : null;
    slotToUser[slot] = member?.display_name || member?.username || `Slot ${slot}`;
    if (roster?.owner_id) slotToUserId[slot] = roster.owner_id;
    rosterIdToName[rosterId] = member?.display_name || member?.username || `Team ${rosterId}`;
  }
  // Fallback: fill from draft_order for any slots not in slot_to_roster_id
  for (const [userId, slot] of Object.entries(draft_order) as [string, number][]) {
    if (!slotToUser[slot]) {
      const member = members.find((m) => m.user_id === userId);
      slotToUser[slot] = member?.display_name || member?.username || `Slot ${slot}`;
      slotToUserId[slot] = userId;
    }
  }

  const autoPickUsers: string[] = draft.metadata?.auto_pick_users ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border border-input bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
              Rd
            </th>
            {Array.from({ length: teams }, (_, i) => i + 1).map((slot) => (
              <th
                key={slot}
                className={`border border-input px-3 py-2 text-xs font-medium ${
                  slot === userSlot ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  {slotToUser[slot] || `Slot ${slot}`}
                  {autoPickUsers.includes(slotToUserId[slot]) && (
                    <span className="text-orange-500 text-[10px] font-bold" title="Auto-picking">AUTO</span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, rIdx) => (
            <tr key={rIdx}>
              <td className="sticky left-0 z-10 border border-input bg-surface px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                {rIdx + 1}
              </td>
              {row.map((pick, sIdx) => {
                const slot = sIdx + 1;
                const isNextPick = nextPick && pick && pick.id === nextPick.id;
                const isUserPick = pick && userRosterId !== undefined && pick.roster_id === userRosterId;
                const isFilled = pick?.player_id;
                const originalRosterId = draft.slot_to_roster_id?.[String(slot)];
                const isTraded = pick && originalRosterId !== undefined && pick.roster_id !== originalRosterId;
                const tradedOwnerName = isTraded ? rosterIdToName[pick.roster_id] : null;

                return (
                  <td
                    key={sIdx}
                    className={`border border-input px-2 py-1.5 text-center text-xs ${
                      isNextPick
                        ? 'bg-highlight ring-2 ring-inset ring-highlight-ring'
                        : isFilled
                          ? isUserPick
                            ? 'bg-primary/10'
                            : 'bg-card'
                          : isTraded
                            ? 'bg-info'
                            : 'bg-surface'
                    }`}
                  >
                    {isFilled ? (
                      <div>
                        {pick.metadata?.rookie_pick ? (
                          <span className="font-bold text-amber-600">
                            {pick.metadata.last_name}
                          </span>
                        ) : (
                          <>
                            <span className="font-medium text-foreground">
                              {pick.metadata?.first_name?.[0]}. {pick.metadata?.last_name || pick.player_id}
                            </span>
                            {pick.metadata?.position && (
                              <span className="ml-1 text-disabled">{pick.metadata.position}</span>
                            )}
                          </>
                        )}
                        {isTraded && tradedOwnerName && (
                          <div className="text-[10px] text-info-foreground">{tradedOwnerName}</div>
                        )}
                      </div>
                    ) : isNextPick ? (
                      <div>
                        <span className="text-highlight-foreground font-medium">OTC</span>
                        {isTraded && tradedOwnerName && (
                          <div className="text-[10px] text-info-foreground">&rarr; {tradedOwnerName}</div>
                        )}
                      </div>
                    ) : isTraded && tradedOwnerName ? (
                      <span className="text-[10px] text-info-foreground">&rarr; {tradedOwnerName}</span>
                    ) : (
                      <span className="text-disabled">&mdash;</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
