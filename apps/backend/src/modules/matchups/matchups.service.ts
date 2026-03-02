import { MatchupRepository } from './matchups.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { Matchup } from './matchups.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
} from '../../shared/exceptions';

export class MatchupService {
  constructor(
    private readonly matchupRepository: MatchupRepository,
    private readonly leagueRepository: LeagueRepository,
  ) {}

  async generateMatchups(leagueId: string, userId: string): Promise<Matchup[]> {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can generate matchups');
    }

    if (league.status !== 'in_season') {
      throw new ValidationException(
        'Matchups can only be generated when the league is in season'
      );
    }

    if ((league.settings.matchup_type ?? 0) === 1) {
      throw new ValidationException(
        'This league uses the matchup derby. Start a matchup derby to generate the schedule.'
      );
    }

    const rosters = await this.leagueRepository.findRostersByLeagueId(leagueId);
    const rosterIds = rosters.map((r) => r.rosterId);

    if (rosterIds.length < 2) {
      throw new ValidationException('Need at least 2 teams to generate matchups');
    }

    const playoffWeekStart = league.settings.playoff_week_start ?? 15;
    const regularSeasonWeeks = playoffWeekStart - 1;

    const schedule = this.generateRoundRobinSchedule(rosterIds, regularSeasonWeeks);

    // Build flat rows for bulk insert
    const rows: Array<{ week: number; matchup_id: number; roster_id: number }> = [];
    for (const weekData of schedule) {
      for (const pairing of weekData.pairings) {
        rows.push({ week: weekData.week, matchup_id: pairing.matchupId, roster_id: pairing.team1 });
        rows.push({ week: weekData.week, matchup_id: pairing.matchupId, roster_id: pairing.team2 });
      }
      for (const byeTeam of weekData.byes) {
        rows.push({ week: weekData.week, matchup_id: 0, roster_id: byeTeam });
      }
    }

    await this.matchupRepository.deleteByLeagueId(leagueId);
    return this.matchupRepository.bulkInsert(leagueId, rows);
  }

  async getMatchups(leagueId: string, userId: string): Promise<Matchup[]> {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return this.matchupRepository.findByLeagueId(leagueId);
  }

  async getMatchupsByWeek(leagueId: string, week: number, userId: string): Promise<Matchup[]> {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return this.matchupRepository.findByLeagueAndWeek(leagueId, week);
  }

  /**
   * Round-robin circle method:
   * 1. Shuffle roster IDs (Fisher-Yates)
   * 2. If odd count, add ghost team (-1) for byes
   * 3. Fix position 0, rotate positions 1..N-1
   * 4. Each round: pair circle[i] vs circle[N-1-i]
   * 5. Repeat cycle for remaining weeks
   */
  private generateRoundRobinSchedule(
    rosterIds: number[],
    totalWeeks: number
  ): Array<{
    week: number;
    pairings: Array<{ matchupId: number; team1: number; team2: number }>;
    byes: number[];
  }> {
    // Shuffle
    const shuffled = [...rosterIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Pad to even with ghost
    const isOdd = shuffled.length % 2 !== 0;
    const teams = isOdd ? [...shuffled, -1] : [...shuffled];
    const n = teams.length;
    const roundsInCycle = n - 1;

    // Generate one full cycle
    const cycle: Array<{
      pairings: Array<{ matchupId: number; team1: number; team2: number }>;
      byes: number[];
    }> = [];

    const circle = [...teams];

    for (let round = 0; round < roundsInCycle; round++) {
      const pairings: Array<{ matchupId: number; team1: number; team2: number }> = [];
      const byes: number[] = [];
      let matchupCounter = 1;

      for (let i = 0; i < n / 2; i++) {
        const team1 = circle[i];
        const team2 = circle[n - 1 - i];

        if (team1 === -1) {
          byes.push(team2);
        } else if (team2 === -1) {
          byes.push(team1);
        } else {
          pairings.push({ matchupId: matchupCounter++, team1, team2 });
        }
      }

      cycle.push({ pairings, byes });

      // Rotate: fix circle[0], shift the rest right by 1
      const last = circle[n - 1];
      for (let i = n - 1; i > 1; i--) {
        circle[i] = circle[i - 1];
      }
      circle[1] = last;
    }

    // Fill total weeks by repeating the cycle
    const schedule: Array<{
      week: number;
      pairings: Array<{ matchupId: number; team1: number; team2: number }>;
      byes: number[];
    }> = [];

    for (let week = 1; week <= totalWeeks; week++) {
      const cycleIndex = (week - 1) % roundsInCycle;
      schedule.push({ week, ...cycle[cycleIndex] });
    }

    return schedule;
  }
}
