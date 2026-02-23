'use client';

import type { Draft, DraftPick } from '@/lib/api';

interface DraftBoardProps {
  draft: Draft;
  picks: DraftPick[];
  currentUserId: string | undefined;
}

export function DraftBoard({ draft, picks, currentUserId }: DraftBoardProps) {
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

  // Build slot -> username mapping from draft_order (reversed)
  const slotToUser: Record<number, string> = {};
  for (const [userId, slot] of Object.entries(draft_order) as [string, number][]) {
    const pick = picks.find((p) => p.draft_slot === slot && p.picked_by === userId);
    slotToUser[slot] = pick?.username ?? `Slot ${slot}`;
  }
  // Fallback: use any pick's username for that slot
  for (const pick of picks) {
    if (!slotToUser[pick.draft_slot] && pick.username) {
      slotToUser[pick.draft_slot] = pick.username;
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border border-gray-300 bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600">
              Rd
            </th>
            {Array.from({ length: teams }, (_, i) => i + 1).map((slot) => (
              <th
                key={slot}
                className={`border border-gray-300 px-3 py-2 text-xs font-medium ${
                  slot === userSlot ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {slotToUser[slot] || `Slot ${slot}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, rIdx) => (
            <tr key={rIdx}>
              <td className="sticky left-0 z-10 border border-gray-300 bg-gray-50 px-3 py-2 text-center text-xs font-medium text-gray-600">
                {rIdx + 1}
              </td>
              {row.map((pick, sIdx) => {
                const isNextPick = nextPick && pick && pick.id === nextPick.id;
                const isUserPick = pick && pick.draft_slot === userSlot;
                const isFilled = pick?.player_id;

                return (
                  <td
                    key={sIdx}
                    className={`border border-gray-300 px-2 py-1.5 text-center text-xs ${
                      isNextPick
                        ? 'bg-yellow-100 ring-2 ring-inset ring-yellow-400'
                        : isFilled
                          ? isUserPick
                            ? 'bg-blue-50'
                            : 'bg-white'
                          : 'bg-gray-50'
                    }`}
                  >
                    {isFilled ? (
                      <div>
                        <span className="font-medium text-gray-900">
                          {pick.metadata?.first_name?.[0]}. {pick.metadata?.last_name || pick.player_id}
                        </span>
                        {pick.metadata?.position && (
                          <span className="ml-1 text-gray-400">{pick.metadata.position}</span>
                        )}
                      </div>
                    ) : isNextPick ? (
                      <span className="text-yellow-600 font-medium">OTC</span>
                    ) : (
                      <span className="text-gray-300">&mdash;</span>
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
