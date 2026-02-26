import type { RosterPosition } from '@tbdff/shared';

export const ROSTER_POSITION_CONFIG: { key: RosterPosition; label: string; min: number; max: number }[] = [
  { key: 'QB', label: 'QB', min: 0, max: 5 },
  { key: 'RB', label: 'RB', min: 0, max: 8 },
  { key: 'WR', label: 'WR', min: 0, max: 8 },
  { key: 'TE', label: 'TE', min: 0, max: 5 },
  { key: 'FLEX', label: 'FLEX (RB/WR/TE)', min: 0, max: 8 },
  { key: 'SUPER_FLEX', label: 'SUPER FLEX (QB/RB/WR/TE)', min: 0, max: 5 },
  { key: 'REC_FLEX', label: 'REC FLEX (WR/TE)', min: 0, max: 5 },
  { key: 'WRRB_FLEX', label: 'WRRB FLEX (WR/RB)', min: 0, max: 5 },
  { key: 'K', label: 'K', min: 0, max: 3 },
  { key: 'DEF', label: 'DEF', min: 0, max: 3 },
  { key: 'BN', label: 'Bench', min: 0, max: 15 },
  { key: 'IR', label: 'IR', min: 0, max: 5 },
];

export function positionArrayToCounts(positions: RosterPosition[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pos of ROSTER_POSITION_CONFIG) {
    counts[pos.key] = 0;
  }
  for (const pos of positions) {
    counts[pos] = (counts[pos] ?? 0) + 1;
  }
  return counts;
}

export function countsToPositionArray(counts: Record<string, number>): RosterPosition[] {
  const arr: RosterPosition[] = [];
  for (const pos of ROSTER_POSITION_CONFIG) {
    const count = counts[pos.key] ?? 0;
    for (let i = 0; i < count; i++) {
      arr.push(pos.key);
    }
  }
  return arr;
}
