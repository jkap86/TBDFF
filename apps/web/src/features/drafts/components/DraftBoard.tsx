'use client';

import type { Draft, DraftPick, LeagueMember } from '@/lib/api';

interface DraftBoardProps {
  draft: Draft;
  picks: DraftPick[];
  members: LeagueMember[];
  currentUserId: string | undefined;
}

export function DraftBoard({ draft, picks, members, currentUserId }: DraftBoardProps) {
  const { settings, draft_order } = draft;
  const teams = settings.teams;
  const rounds = settings.rounds;

  // Build a grid: picks[round][slot]
  const grid: (DraftPick | null)[][] = [];
  for (let r = 1; r <= rounds; r++) {
    const row: (DraftPick | null)[] = [];
    for (let s = 1; s <= teams; s++) {
      const pick = picks.find((p) => p.round === r && p.draft_slot === s);
      row.push(pick ?? null);
    }
    grid.push(row);
  }

  // Find which slot the current user has
  const userSlot = currentUserId ? draft_order[currentUserId] : undefined;

  // Find the next pick
  const nextPick = picks.find((p) => !p.player_id);

  // Build slot -> username and slot -> userId mapping from draft_order + members
  const slotToUser: Record<number, string> = {};
  const slotToUserId: Record<number, string> = {};
  for (const [userId, slot] of Object.entries(draft_order) as [string, number][]) {
    const member = members.find((m) => m.user_id === userId);
    slotToUser[slot] = member?.display_name || member?.username || `Slot ${slot}`;
    slotToUserId[slot] = userId;
  }

  const autoPickUsers: string[] = draft.metadata?.auto_pick_users ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">
              Rd
            </th>
            {Array.from({ length: teams }, (_, i) => i + 1).map((slot) => (
              <th
                key={slot}
                className={`border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-medium ${
                  slot === userSlot ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
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
              <td className="sticky left-0 z-10 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-center text-xs font-medium text-gray-600 dark:text-gray-400">
                {rIdx + 1}
              </td>
              {row.map((pick, sIdx) => {
                const isNextPick = nextPick && pick && pick.id === nextPick.id;
                const isUserPick = pick && pick.draft_slot === userSlot;
                const isFilled = pick?.player_id;

                return (
                  <td
                    key={sIdx}
                    className={`border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-center text-xs ${
                      isNextPick
                        ? 'bg-yellow-100 ring-2 ring-inset ring-yellow-400'
                        : isFilled
                          ? isUserPick
                            ? 'bg-blue-50'
                            : 'bg-white dark:bg-gray-800'
                          : 'bg-gray-50 dark:bg-gray-800'
                    }`}
                  >
                    {isFilled ? (
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {pick.metadata?.first_name?.[0]}. {pick.metadata?.last_name || pick.player_id}
                        </span>
                        {pick.metadata?.position && (
                          <span className="ml-1 text-gray-400 dark:text-gray-500">{pick.metadata.position}</span>
                        )}
                      </div>
                    ) : isNextPick ? (
                      <span className="text-yellow-600 font-medium">OTC</span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">&mdash;</span>
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
