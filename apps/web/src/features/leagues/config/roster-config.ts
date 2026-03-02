import type { RosterPosition } from '@tbdff/shared';

export const ROSTER_POSITION_CONFIG: { key: RosterPosition; label: string; defaultCount: number; min: number; max: number }[] = [
  { key: 'QB', label: 'QB', defaultCount: 1, min: 0, max: 5 },
  { key: 'RB', label: 'RB', defaultCount: 2, min: 0, max: 8 },
  { key: 'WR', label: 'WR', defaultCount: 2, min: 0, max: 8 },
  { key: 'TE', label: 'TE', defaultCount: 1, min: 0, max: 5 },
  { key: 'FLEX', label: 'FLEX (RB/WR/TE)', defaultCount: 2, min: 0, max: 8 },
  { key: 'SUPER_FLEX', label: 'SUPER FLEX (QB/RB/WR/TE)', defaultCount: 1, min: 0, max: 5 },
  { key: 'REC_FLEX', label: 'REC FLEX (WR/TE)', defaultCount: 0, min: 0, max: 5 },
  { key: 'WRRB_FLEX', label: 'WRRB FLEX (WR/RB)', defaultCount: 0, min: 0, max: 5 },
  { key: 'K', label: 'K', defaultCount: 1, min: 0, max: 3 },
  { key: 'DEF', label: 'DEF', defaultCount: 1, min: 0, max: 3 },
  { key: 'BN', label: 'Bench', defaultCount: 5, min: 0, max: 15 },
  { key: 'IR', label: 'IR', defaultCount: 1, min: 0, max: 5 },
];

export const DEFAULT_ROSTER_COUNTS: Record<string, number> = {};
for (const pos of ROSTER_POSITION_CONFIG) {
  DEFAULT_ROSTER_COUNTS[pos.key] = pos.defaultCount;
}

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
