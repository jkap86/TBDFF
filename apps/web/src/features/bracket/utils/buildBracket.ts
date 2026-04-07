import type { Matchup } from '@tbdff/shared';

export interface BracketSlot {
  matchupId: number | null;
  week: number;
  rosterIdA: number | null;
  rosterIdB: number | null;
  pointsA: number;
  pointsB: number;
  winnerId: number | null;
  isBye: boolean;
}

export interface BracketRound {
  label: string;
  week: number;
  slots: BracketSlot[];
}

function getRoundLabels(playoffTeams: number, numRounds: number): string[] {
  if (playoffTeams <= 4) {
    // 2 rounds
    return ['Semifinals', 'Championship'].slice(0, numRounds);
  }
  // 6+ teams: 3 rounds
  return ['Quarterfinals', 'Semifinals', 'Championship'].slice(0, numRounds);
}

export function buildBracket(
  matchups: Matchup[],
  playoffWeekStart: number,
): BracketRound[] {
  const playoffMatchups = matchups.filter((m) => m.week >= playoffWeekStart);
  const weeks = [...new Set(playoffMatchups.map((m) => m.week))].sort((a, b) => a - b);

  if (weeks.length === 0) return [];

  // Guess playoff team count from first week's matchups
  const firstWeekMatchups = playoffMatchups.filter((m) => m.week === weeks[0]);
  const byeCount = firstWeekMatchups.filter((m) => m.matchup_id === 0).length;
  const matchupCount = new Set(
    firstWeekMatchups.filter((m) => m.matchup_id > 0).map((m) => m.matchup_id),
  ).size;
  const totalTeamsFirstRound = byeCount + matchupCount * 2;

  const labels = getRoundLabels(totalTeamsFirstRound, weeks.length);

  return weeks.map((week, idx) => {
    const weekMatchups = playoffMatchups.filter((m) => m.week === week);
    const byes = weekMatchups.filter((m) => m.matchup_id === 0);
    const competitive = weekMatchups.filter((m) => m.matchup_id > 0);

    const grouped: Record<number, Matchup[]> = {};
    for (const m of competitive) {
      if (!grouped[m.matchup_id]) grouped[m.matchup_id] = [];
      grouped[m.matchup_id].push(m);
    }

    const slots: BracketSlot[] = [];

    // BYE slots first (seeds 1 & 2 typically)
    for (const bye of byes) {
      slots.push({
        matchupId: null,
        week,
        rosterIdA: bye.roster_id,
        rosterIdB: null,
        pointsA: bye.points,
        pointsB: 0,
        winnerId: bye.roster_id,
        isBye: true,
      });
    }

    // Competitive matchups
    for (const pair of Object.values(grouped)) {
      const [a, b] = pair;
      const hasScore = (a?.points ?? 0) > 0 || (b?.points ?? 0) > 0;
      const winnerId = hasScore
        ? (a.points >= (b?.points ?? 0) ? a.roster_id : b?.roster_id ?? null)
        : null;
      slots.push({
        matchupId: a.matchup_id,
        week,
        rosterIdA: a.roster_id,
        rosterIdB: b?.roster_id ?? null,
        pointsA: a.points,
        pointsB: b?.points ?? 0,
        winnerId,
        isBye: false,
      });
    }

    return {
      label: labels[idx] ?? `Round ${idx + 1}`,
      week,
      slots,
    };
  });
}
