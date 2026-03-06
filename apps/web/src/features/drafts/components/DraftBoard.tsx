'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import type { Draft, DraftPick, LeagueMember, Roster } from '@/lib/api';

function getPositionColor(position: string | undefined): string {
  switch (position) {
    case 'QB': return 'rgba(239, 68, 68, 0.25)';
    case 'RB': return 'rgba(34, 197, 94, 0.25)';
    case 'WR': return 'rgba(59, 130, 246, 0.25)';
    case 'TE': return 'rgba(249, 115, 22, 0.25)';
    case 'K':  return 'rgba(168, 85, 247, 0.25)';
    case 'DEF': return 'rgba(161, 98, 7, 0.25)';
    default:   return 'hsl(var(--card))';
  }
}

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
  const [transposed, setTransposed] = useState(false);

  // Auto-scroll to the OTC row
  const otcRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    otcRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [nextPick?.id]);

  // Render a single pick cell (shared between normal and transposed views)
  const renderPickCell = (pick: DraftPick | null, roundNum: number, slot: number, key: number) => {
    const isNextPick = nextPick && pick && pick.id === nextPick.id;
    const isUserPick = pick && userRosterId !== undefined && pick.roster_id === userRosterId;
    const isFilled = pick?.player_id;
    const originalRosterId = draft.slot_to_roster_id?.[String(slot)];
    const isTraded = pick && originalRosterId !== undefined && pick.roster_id !== originalRosterId;
    const tradedOwnerName = isTraded ? rosterIdToName[pick.roster_id] : null;

    return (
      <td
        key={key}
        className={`relative border-b border-r border-border px-3 py-5 text-center text-sm transition-colors min-w-[110px] ${
          isNextPick
            ? 'ring-2 ring-inset ring-highlight-ring'
            : isUserPick && isFilled
              ? 'ring-1 ring-inset ring-primary/40'
              : ''
        }`}
        style={{
          background: isNextPick
            ? 'radial-gradient(ellipse at 50% 30%, hsl(var(--highlight)) 0%, hsl(var(--highlight) / 0.7) 100%)'
            : isFilled
              ? getPositionColor(pick.metadata?.position)
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
          <>
            <span className="absolute top-0.5 right-1 text-[10px] text-foreground/40">{roundNum}.{String(slot).padStart(2, '0')}</span>
            <div className="leading-tight">
              {pick.metadata?.rookie_pick ? (
                <span className="font-heading font-bold text-amber-600">
                  {pick.metadata.last_name}
                </span>
              ) : (
                <>
                  <span className="font-heading font-semibold text-foreground">
                    {pick.metadata?.first_name?.[0]}. {pick.metadata?.last_name || pick.player_id}
                  </span>
                  {(pick.metadata?.position || pick.metadata?.team) && (
                    <div className="text-[11px] text-disabled">{pick.metadata.position}{pick.metadata.team ? ` - ${pick.metadata.team}` : ''}</div>
                  )}
                </>
              )}
              {isTraded && tradedOwnerName && (
                <div className="text-[11px] text-info-foreground">{tradedOwnerName}</div>
              )}
            </div>
          </>
        ) : isNextPick ? (
          <div>
            <span className="text-highlight-foreground font-bold animate-pulse">OTC</span>
            {isTraded && tradedOwnerName && (
              <div className="text-[11px] text-info-foreground">&rarr; {tradedOwnerName}</div>
            )}
          </div>
        ) : isTraded && tradedOwnerName ? (
          <span className="text-[11px] text-info-foreground">&rarr; {tradedOwnerName}</span>
        ) : (
          <span className="font-heading font-bold text-disabled/40">{roundNum}.{String(slot).padStart(2, '0')}</span>
        )}
      </td>
    );
  };

  return (
    <div className="overflow-auto flex-1" style={{ WebkitOverflowScrolling: 'touch' }}>
      <table className="min-w-max" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            {/* Top-left corner cell: axis toggle button */}
            <th
              className="sticky top-0 left-0 z-30 bg-muted border-b border-r border-border px-2 py-2"
              style={{ boxShadow: '2px 2px 4px rgba(0,0,0,0.15)' }}
            >
              <button
                onClick={() => setTransposed((t) => !t)}
                className="p-1.5 rounded hover:bg-foreground/10 text-muted-foreground transition-colors"
                title={transposed ? 'Switch to rounds as rows' : 'Switch to teams as rows'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="7 2 3 6 7 10" />
                  <path d="M3 6h18" />
                  <polyline points="17 14 21 18 17 22" />
                  <path d="M21 18H3" />
                </svg>
              </button>
            </th>
            {transposed ? (
              // Transposed: columns are rounds
              Array.from({ length: rounds }, (_, i) => i + 1).map((roundNum) => {
                const isReversed = isSnake && roundNum % 2 === 0;
                return (
                  <th
                    key={roundNum}
                    className="sticky top-0 z-20 border-b border-r border-border px-3 py-3.5 text-sm font-heading font-semibold whitespace-nowrap bg-muted text-muted-foreground"
                    style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Rd {roundNum}
                      {isSnake && (
                        <span className="text-[10px] text-disabled" title={isReversed ? 'Reverse order' : 'Normal order'}>
                          {isReversed ? '\u2193' : '\u2191'}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })
            ) : (
              // Normal: columns are teams
              Array.from({ length: teams }, (_, i) => i + 1).map((slot) => (
                <th
                  key={slot}
                  className={`sticky top-0 z-20 border-b border-r border-border px-3 py-3.5 text-sm font-heading font-semibold whitespace-nowrap bg-muted ${
                    slot === userSlot
                      ? 'text-primary'
                      : 'text-muted-foreground'
                  }`}
                  style={{
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    {slotToUser[slot] || `Slot ${slot}`}
                    {autoPickUsers.includes(slotToUserId[slot]) && (
                      <span className="rounded bg-orange-500/20 px-1 text-[9px] font-bold text-orange-500" title="Auto-picking">AUTO</span>
                    )}
                  </div>
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {transposed ? (
            // Transposed: rows are teams, columns are rounds
            Array.from({ length: teams }, (_, sIdx) => {
              const slot = sIdx + 1;
              const isUser = slot === userSlot;
              return (
                <tr key={sIdx}>
                  <td
                    className={`sticky left-0 z-10 border-b border-r border-border bg-muted px-3 py-5 text-center text-sm font-heading font-semibold whitespace-nowrap ${
                      isUser ? 'text-primary' : 'text-muted-foreground'
                    }`}
                    style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.1)' }}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      {slotToUser[slot] || `Slot ${slot}`}
                      {autoPickUsers.includes(slotToUserId[slot]) && (
                        <span className="rounded bg-orange-500/20 px-1 text-[9px] font-bold text-orange-500" title="Auto-picking">AUTO</span>
                      )}
                    </div>
                  </td>
                  {Array.from({ length: rounds }, (_, rIdx) => {
                    const roundNum = rIdx + 1;
                    const pick = grid[rIdx]?.[sIdx] ?? null;
                    return renderPickCell(pick, roundNum, slot, rIdx);
                  })}
                </tr>
              );
            })
          ) : (
            // Normal: rows are rounds, columns are teams
            grid.map((row, rIdx) => {
              const roundNum = rIdx + 1;
              const isReversed = isSnake && roundNum % 2 === 0;
              const hasOtc = nextPick && row.some((p) => p?.id === nextPick.id);

              return (
                <tr key={rIdx} ref={hasOtc ? otcRef : undefined}>
                  {/* Frozen round column */}
                  <td className="sticky left-0 z-10 border-b border-r border-border bg-muted px-3 py-5 text-center text-sm font-heading font-semibold text-muted-foreground" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.1)' }}>
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
                    return renderPickCell(pick, roundNum, slot, sIdx);
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
