import { LeagueScoringSettings } from '../leagues/leagues.model';

/**
 * Defense points-allowed brackets.
 * Only one bracket applies based on the raw pts_allow value from stats.
 */
const DEF_PTS_ALLOW_BRACKETS = [
  { max: 0, key: 'pts_allow_0' },
  { max: 6, key: 'pts_allow_1_6' },
  { max: 13, key: 'pts_allow_7_13' },
  { max: 20, key: 'pts_allow_14_20' },
  { max: 27, key: 'pts_allow_21_27' },
  { max: 34, key: 'pts_allow_28_34' },
  { max: Infinity, key: 'pts_allow_35p' },
] as const;

const BRACKET_KEYS: Set<string> = new Set(DEF_PTS_ALLOW_BRACKETS.map((b) => b.key));

/**
 * Calculate fantasy points for a single player's stat line.
 *
 * For most stats: points += stat_value * scoring_weight
 * For defense pts_allow: bracket-based scoring (only one bracket applies)
 */
export function calculateFantasyPoints(
  stats: Record<string, number>,
  scoringSettings: LeagueScoringSettings,
): number {
  let points = 0;

  for (const [statKey, statValue] of Object.entries(stats)) {
    // Skip bracket keys and raw pts_allow (handled below)
    if (BRACKET_KEYS.has(statKey) || statKey === 'pts_allow') continue;

    const weight = scoringSettings[statKey];
    if (weight !== undefined && weight !== 0 && statValue !== 0) {
      points += statValue * weight;
    }
  }

  // Defense bracket scoring
  const ptsAllow = stats['pts_allow'];
  if (ptsAllow !== undefined) {
    for (const bracket of DEF_PTS_ALLOW_BRACKETS) {
      if (ptsAllow <= bracket.max) {
        const bracketWeight = scoringSettings[bracket.key];
        if (bracketWeight !== undefined) {
          points += bracketWeight;
        }
        break;
      }
    }
  }

  return Math.round(points * 100) / 100;
}

/**
 * Calculate remaining projected stats by subtracting actual from projected.
 * Each stat is clamped to 0 (can't have negative remaining).
 */
export function calculateRemainingStats(
  projected: Record<string, number>,
  actual: Record<string, number>,
): Record<string, number> {
  const remaining: Record<string, number> = {};
  for (const [key, projectedValue] of Object.entries(projected)) {
    const actualValue = actual[key] ?? 0;
    remaining[key] = Math.max(0, projectedValue - actualValue);
  }
  return remaining;
}

export type GameStatus = 'pre_game' | 'in_game' | 'complete';

/**
 * Calculate a player's live total points based on game status.
 * - pre_game: use full projection
 * - in_game: actual points + remaining projected points
 * - complete: actual points only
 */
export function calculateLivePoints(
  actual: Record<string, number>,
  projected: Record<string, number>,
  gameStatus: GameStatus,
  scoringSettings: LeagueScoringSettings,
): { actual_points: number; projected_points: number; live_total: number } {
  const actual_points = Object.keys(actual).length > 0
    ? calculateFantasyPoints(actual, scoringSettings)
    : 0;
  const projected_points = calculateFantasyPoints(projected, scoringSettings);

  let live_total: number;
  switch (gameStatus) {
    case 'complete':
      live_total = actual_points;
      break;
    case 'in_game': {
      const remaining = calculateRemainingStats(projected, actual);
      const remainingPoints = calculateFantasyPoints(remaining, scoringSettings);
      live_total = actual_points + remainingPoints;
      break;
    }
    case 'pre_game':
    default:
      live_total = projected_points;
      break;
  }

  return {
    actual_points: Math.round(actual_points * 100) / 100,
    projected_points: Math.round(projected_points * 100) / 100,
    live_total: Math.round(live_total * 100) / 100,
  };
}
