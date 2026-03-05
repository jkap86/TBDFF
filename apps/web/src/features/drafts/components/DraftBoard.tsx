'use client';

import { useMemo, useRef, useEffect } from 'react';
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
  const isSnake = draft.type === 'snake' || draft.type === '3rr';

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

  // Auto-scroll to the OTC row
  const otcRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    otcRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [nextPick?.id]);

  return (
    <div className="overflow-auto flex-1" style={{ WebkitOverflowScrolling: 'touch' }}>
      <table className="min-w-max" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            {/* Top-left corner cell: frozen both ways */}
            <th
              className="sticky top-0 left-0 z-30 bg-muted border-b border-r border-border px-3 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              style={{ boxShadow: '2px 2px 4px rgba(0,0,0,0.15)' }}
            >
              Rd
            </th>
            {Array.from({ length: teams }, (_, i) => i + 1).map((slot) => (
              <th
                key={slot}
                className={`sticky top-0 z-20 border-b border-r border-border px-3 py-3.5 text-xs font-semibold whitespace-nowrap ${
                  slot === userSlot
                    ? 'text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
                style={{
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  ...(slot === userSlot ? { background: 'color-mix(in srgb, hsl(var(--primary)) 15%, hsl(var(--muted)))' } : {}),
                }}
              >
                <div className="flex items-center justify-center gap-1.5">
                  {slotToUser[slot] || `Slot ${slot}`}
                  {autoPickUsers.includes(slotToUserId[slot]) && (
                    <span className="rounded bg-orange-500/20 px-1 text-[9px] font-bold text-orange-500" title="Auto-picking">AUTO</span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, rIdx) => {
            const roundNum = rIdx + 1;
            const isReversed = isSnake && roundNum % 2 === 0;
            const hasOtc = nextPick && row.some((p) => p?.id === nextPick.id);

            return (
              <tr key={rIdx} ref={hasOtc ? otcRef : undefined}>
                {/* Frozen round column */}
                <td className="sticky left-0 z-10 border-b border-r border-border bg-muted px-3 py-5 text-center text-xs font-semibold text-muted-foreground" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.1)' }}>
                  <div className="flex items-center justify-center gap-1">
                    {roundNum}
                    {isSnake && (
                      <span className="text-[10px] text-disabled" title={isReversed ? 'Reverse order' : 'Normal order'}>
                        {isReversed ? '\u2190' : '\u2192'}
                      </span>
                    )}
                  </div>
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
                      className={`border-b border-r border-border px-3 py-5 text-center text-xs transition-colors min-w-[100px] ${
                        isNextPick
                          ? 'ring-2 ring-inset ring-highlight-ring'
                          : ''
                      }`}
                      style={{
                        background: isNextPick
                          ? 'radial-gradient(ellipse at 50% 30%, hsl(var(--highlight)) 0%, hsl(var(--highlight) / 0.7) 100%)'
                          : isFilled
                            ? isUserPick
                              ? 'radial-gradient(ellipse at 50% 30%, hsl(var(--primary) / 0.18) 0%, hsl(var(--primary) / 0.06) 100%)'
                              : 'radial-gradient(ellipse at 50% 30%, hsl(var(--card) / 1) 0%, hsl(var(--card) / 0.8) 100%)'
                            : isTraded
                              ? 'radial-gradient(ellipse at 50% 30%, hsl(var(--info)) 0%, hsl(var(--info) / 0.7) 100%)'
                              : 'radial-gradient(ellipse at 50% 30%, hsl(var(--surface) / 1) 0%, hsl(var(--surface) / 0.7) 100%)',
                        boxShadow: isNextPick
                          ? 'inset 0 1px 3px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.06)'
                          : isFilled
                            ? 'inset 0 1px 2px rgba(0,0,0,0.1), 0 1px 0 rgba(255,255,255,0.04)'
                            : 'inset 0 2px 4px rgba(0,0,0,0.06)',
                      }}
                    >
                      {isFilled ? (
                        <div className="leading-tight">
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
                          {pick.pick_no > 0 && (
                            <div className="text-[10px] text-disabled">#{pick.pick_no}</div>
                          )}
                          {isTraded && tradedOwnerName && (
                            <div className="text-[10px] text-info-foreground">{tradedOwnerName}</div>
                          )}
                        </div>
                      ) : isNextPick ? (
                        <div>
                          <span className="text-highlight-foreground font-bold animate-pulse">OTC</span>
                          {isTraded && tradedOwnerName && (
                            <div className="text-[10px] text-info-foreground">&rarr; {tradedOwnerName}</div>
                          )}
                        </div>
                      ) : isTraded && tradedOwnerName ? (
                        <span className="text-[10px] text-info-foreground">&rarr; {tradedOwnerName}</span>
                      ) : (
                        <span className="font-heading font-bold text-disabled/40 text-sm">{roundNum}.{String(slot).padStart(2, '0')}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
