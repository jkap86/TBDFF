import { MatchupDerbyRepository } from './matchup-derby.repository';
import { MatchupRepository } from './matchups.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { MatchupDerby, MatchupDerbyOrderEntry, MatchupDerbyPick } from './matchup-derby.model';
import { MatchupDerbyGateway } from './matchup-derby.gateway';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../../shared/exceptions';

export class MatchupDerbyService {
  private gateway?: MatchupDerbyGateway;

  constructor(
    private readonly derbyRepository: MatchupDerbyRepository,
    private readonly matchupRepository: MatchupRepository,
    private readonly leagueRepository: LeagueRepository,
  ) {}

  setGateway(gateway: MatchupDerbyGateway): void {
    this.gateway = gateway;
  }

  async startDerby(leagueId: string, userId: string): Promise<MatchupDerby> {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can start a matchup derby');
    }

    if (league.status !== 'in_season' && league.status !== 'pre_draft') {
      throw new ValidationException('Matchup derby can only be started when the league is in pre-draft or in season');
    }

    if ((league.settings.matchup_type ?? 0) !== 1) {
      throw new ValidationException('This league is not configured for matchup derby');
    }

    const existing = await this.derbyRepository.findActiveByLeagueId(leagueId);
    if (existing) {
      throw new ConflictException('A matchup derby is already active for this league');
    }

    const rosters = await this.leagueRepository.findRostersByLeagueId(leagueId);
    const assignedRosters = rosters.filter((r) => r.ownerId);

    if (assignedRosters.length < 2) {
      throw new ValidationException('At least 2 rosters must have assigned owners to start a matchup derby');
    }

    const members = await this.leagueRepository.findMembersByLeagueId(leagueId);
    const usernameMap = new Map(members.map((m) => [m.userId, m.username]));

    const entries: MatchupDerbyOrderEntry[] = assignedRosters.map((r) => ({
      user_id: r.ownerId!,
      roster_id: r.rosterId,
      username: usernameMap.get(r.ownerId!) ?? 'Unknown',
    }));

    const shuffled = this.shuffle(entries);

    const playoffWeekStart = league.settings.playoff_week_start ?? 15;
    const regularSeasonWeeks = playoffWeekStart - 1;
    const teamCount = assignedRosters.length;
    const matchupsPerWeek = Math.floor(teamCount / 2);
    const totalPicks = matchupsPerWeek * regularSeasonWeeks;

    const now = new Date();
    const pickTimer = league.settings.matchup_derby_timer ?? 120;
    const timeoutAction = league.settings.matchup_derby_timeout ?? 0;

    const derby = await this.derbyRepository.create(leagueId, {
      status: 'active',
      derbyOrder: shuffled,
      picks: [],
      currentPickIndex: 0,
      totalPicks,
      pickTimer,
      pickDeadline: pickTimer > 0 ? new Date(now.getTime() + pickTimer * 1000) : null,
      timeoutAction,
      skippedUsers: [],
      startedAt: now,
    });

    this.gateway?.broadcast(leagueId, 'matchup_derby:state_updated', {
      derby: derby.toSafeObject(),
      server_time: new Date().toISOString(),
    });

    return derby;
  }

  async getDerbyState(leagueId: string, userId: string): Promise<MatchupDerby | null> {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return this.derbyRepository.findByLeagueId(leagueId);
  }

  async makePick(
    leagueId: string,
    userId: string,
    opponentRosterId: number,
    week: number,
  ): Promise<MatchupDerby> {
    // Light pre-checks
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const derby = await this.derbyRepository.findActiveByLeagueId(leagueId);
    if (!derby || derby.status !== 'active') {
      throw new ValidationException('No active matchup derby');
    }

    const playoffWeekStart = league.settings.playoff_week_start ?? 15;
    const regularSeasonWeeks = playoffWeekStart - 1;

    // All mutation under advisory lock
    const updated = await this.derbyRepository.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mderby:${leagueId}`]);

      const freshDerby = await this.derbyRepository.findActiveByLeagueId(leagueId, client);
      if (!freshDerby || freshDerby.status !== 'active') {
        throw new ValidationException('Matchup derby is no longer active');
      }

      return this.executePick(
        freshDerby,
        userId,
        member.role === 'commissioner',
        opponentRosterId,
        week,
        regularSeasonWeeks,
        client,
      );
    });

    this.gateway?.broadcast(leagueId, 'matchup_derby:state_updated', {
      derby: updated.toSafeObject(),
      server_time: new Date().toISOString(),
    });

    return updated;
  }

  async autoPick(leagueId: string, userId: string): Promise<MatchupDerby> {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const isCommissioner = member.role === 'commissioner';
    const playoffWeekStart = league.settings.playoff_week_start ?? 15;
    const regularSeasonWeeks = playoffWeekStart - 1;

    const rosters = await this.leagueRepository.findRostersByLeagueId(leagueId);
    const allRosterIds = rosters.filter((r) => r.ownerId).map((r) => r.rosterId);

    const updated = await this.derbyRepository.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mderby:${leagueId}`]);

      const freshDerby = await this.derbyRepository.findActiveByLeagueId(leagueId, client);
      if (!freshDerby || freshDerby.status !== 'active') {
        throw new ValidationException('No active matchup derby');
      }

      // Validate timer has expired (commissioners bypass)
      // 3s grace for client-server clock differences
      if (!isCommissioner && freshDerby.pickDeadline) {
        const grace = 3000;
        if (Date.now() + grace < freshDerby.pickDeadline.getTime()) {
          throw new ValidationException('Matchup derby pick timer has not expired yet');
        }
      }

      const currentPicker = this.getCurrentPicker(freshDerby);
      if (!currentPicker) {
        throw new ValidationException('No more picks remaining');
      }

      // Check timeout action: skip or autopick
      if ((freshDerby.timeoutAction ?? 0) === 1) {
        return this.executeSkip(freshDerby, client);
      }

      // Autopick: random valid cell
      const available = this.getAvailableCells(
        freshDerby,
        currentPicker.roster_id,
        allRosterIds,
        regularSeasonWeeks,
      );

      if (available.length === 0) {
        // No valid cells — skip this user
        return this.executeSkip(freshDerby, client);
      }

      const pick = available[Math.floor(Math.random() * available.length)];

      return this.executePick(
        freshDerby,
        currentPicker.user_id,
        true,
        pick.opponent_roster_id,
        pick.week,
        regularSeasonWeeks,
        client,
      );
    });

    this.gateway?.broadcast(leagueId, 'matchup_derby:state_updated', {
      derby: updated.toSafeObject(),
      server_time: new Date().toISOString(),
    });

    return updated;
  }

  // ---- Private helpers ----

  private getCurrentPicker(derby: MatchupDerby): MatchupDerbyOrderEntry | null {
    // Snake order: determine which team is picking based on current_pick_index
    const teamCount = derby.derbyOrder.length;
    if (teamCount === 0) return null;

    const pickIndex = derby.currentPickIndex;
    if (pickIndex >= derby.totalPicks) return null;

    const round = Math.floor(pickIndex / teamCount);
    const posInRound = pickIndex % teamCount;
    const isReversed = round % 2 === 1;
    const orderIndex = isReversed ? teamCount - 1 - posInRound : posInRound;

    return derby.derbyOrder[orderIndex] ?? null;
  }

  private async executePick(
    derby: MatchupDerby,
    userId: string,
    isCommissioner: boolean,
    opponentRosterId: number,
    week: number,
    totalWeeks: number,
    client: any,
  ): Promise<MatchupDerby> {
    const currentPicker = this.getCurrentPicker(derby);
    const skippedUsers = derby.skippedUsers ?? [];
    const isSkippedUser = skippedUsers.includes(userId);

    // Determine who is picking
    let pickingEntry: MatchupDerbyOrderEntry;

    if (isSkippedUser) {
      const entry = derby.derbyOrder.find((e) => e.user_id === userId);
      if (!entry) throw new ForbiddenException('User not in derby');
      pickingEntry = entry;
    } else if (currentPicker && (isCommissioner || currentPicker.user_id === userId)) {
      pickingEntry = currentPicker;
    } else {
      throw new ForbiddenException('It is not your turn to pick');
    }

    const pickerRosterId = pickingEntry.roster_id;

    // Validate week range
    if (week < 1 || week > totalWeeks) {
      throw new ValidationException(`Week must be between 1 and ${totalWeeks}`);
    }

    // Cannot pick yourself
    if (opponentRosterId === pickerRosterId) {
      throw new ValidationException('Cannot select yourself as opponent');
    }

    // Validate opponent is in the derby
    if (!derby.derbyOrder.some((e) => e.roster_id === opponentRosterId)) {
      throw new ValidationException('Opponent is not in this derby');
    }

    // Validate constraints
    this.validatePickConstraints(derby, pickerRosterId, opponentRosterId, week, totalWeeks);

    const pick: MatchupDerbyPick = {
      user_id: pickingEntry.user_id,
      picker_roster_id: pickerRosterId,
      opponent_roster_id: opponentRosterId,
      week,
      picked_at: new Date().toISOString(),
    };

    const newPicks = [...derby.picks, pick];

    // Remove from skipped list if they were skipped
    const newSkippedUsers = skippedUsers.filter((id) => id !== pickingEntry.user_id);

    // Advance index only for normal turn picks
    let newIndex = derby.currentPickIndex;
    if (!isSkippedUser) {
      newIndex = derby.currentPickIndex + 1;
    }

    const isComplete = newPicks.length >= derby.totalPicks;

    const updateData: {
      status?: string;
      picks: MatchupDerbyPick[];
      currentPickIndex: number;
      skippedUsers: string[];
      pickDeadline: Date | null;
      completedAt?: Date | null;
    } = {
      picks: newPicks,
      currentPickIndex: newIndex,
      skippedUsers: newSkippedUsers,
      pickDeadline: isComplete
        ? derby.pickDeadline
        : isSkippedUser
          ? derby.pickDeadline
          : new Date(Date.now() + derby.pickTimer * 1000),
    };

    if (isComplete) {
      updateData.status = 'complete';
      updateData.completedAt = new Date();
    }

    const updated = await this.derbyRepository.update(derby.id, updateData, client);
    if (!updated) throw new NotFoundException('Derby not found');

    // On completion, convert to matchups
    if (isComplete) {
      await this.convertDerbyToMatchups(derby.leagueId, newPicks, derby.derbyOrder, totalWeeks, client);
    }

    return updated;
  }

  private validatePickConstraints(
    derby: MatchupDerby,
    pickerRosterId: number,
    opponentRosterId: number,
    week: number,
    totalWeeks: number,
  ): void {
    const picks = derby.picks;

    // Check picker is not already playing this week
    for (const p of picks) {
      if (p.week === week && (p.picker_roster_id === pickerRosterId || p.opponent_roster_id === pickerRosterId)) {
        throw new ConflictException(`Your team already has a matchup in week ${week}`);
      }
    }

    // Check opponent is not already playing this week
    for (const p of picks) {
      if (p.week === week && (p.picker_roster_id === opponentRosterId || p.opponent_roster_id === opponentRosterId)) {
        throw new ConflictException(`That opponent already has a matchup in week ${week}`);
      }
    }

    // Check cycle uniqueness: within the current round-robin cycle,
    // picker has not already faced this opponent
    const teamCount = derby.derbyOrder.length;
    const cycleLength = teamCount % 2 === 0 ? teamCount - 1 : teamCount;
    const cycleStart = Math.floor((week - 1) / cycleLength) * cycleLength + 1;
    const cycleEnd = cycleStart + cycleLength - 1;

    for (const p of picks) {
      if (p.week >= cycleStart && p.week <= cycleEnd) {
        const isMatch =
          (p.picker_roster_id === pickerRosterId && p.opponent_roster_id === opponentRosterId) ||
          (p.picker_roster_id === opponentRosterId && p.opponent_roster_id === pickerRosterId);
        if (isMatch) {
          throw new ConflictException(
            'You have already played this opponent in the current schedule cycle'
          );
        }
      }
    }
  }

  getAvailableCells(
    derby: MatchupDerby,
    pickerRosterId: number,
    allRosterIds: number[],
    totalWeeks: number,
  ): Array<{ opponent_roster_id: number; week: number }> {
    const available: Array<{ opponent_roster_id: number; week: number }> = [];
    const picks = derby.picks;
    const teamCount = derby.derbyOrder.length;
    const cycleLength = teamCount % 2 === 0 ? teamCount - 1 : teamCount;

    // Build lookup sets for efficiency
    const pickerWeeks = new Set<number>();
    const rosterWeeks = new Map<number, Set<number>>();
    const cyclePairings = new Map<string, Set<number>>();

    for (const p of picks) {
      // Track which weeks each roster is busy
      if (!rosterWeeks.has(p.picker_roster_id)) rosterWeeks.set(p.picker_roster_id, new Set());
      if (!rosterWeeks.has(p.opponent_roster_id)) rosterWeeks.set(p.opponent_roster_id, new Set());
      rosterWeeks.get(p.picker_roster_id)!.add(p.week);
      rosterWeeks.get(p.opponent_roster_id)!.add(p.week);

      if (p.picker_roster_id === pickerRosterId || p.opponent_roster_id === pickerRosterId) {
        pickerWeeks.add(p.week);
      }

      // Track cycle pairings
      const pair = [Math.min(p.picker_roster_id, p.opponent_roster_id), Math.max(p.picker_roster_id, p.opponent_roster_id)].join(':');
      const cycleIdx = Math.floor((p.week - 1) / cycleLength);
      const cycleKey = `${pair}:${cycleIdx}`;
      if (!cyclePairings.has(cycleKey)) cyclePairings.set(cycleKey, new Set());
      cyclePairings.get(cycleKey)!.add(p.week);
    }

    for (let week = 1; week <= totalWeeks; week++) {
      // Skip if picker already plays this week
      if (pickerWeeks.has(week)) continue;

      const cycleIdx = Math.floor((week - 1) / cycleLength);

      for (const opponentId of allRosterIds) {
        if (opponentId === pickerRosterId) continue;

        // Skip if opponent already plays this week
        if (rosterWeeks.get(opponentId)?.has(week)) continue;

        // Skip if already faced in this cycle
        const pair = [Math.min(pickerRosterId, opponentId), Math.max(pickerRosterId, opponentId)].join(':');
        const cycleKey = `${pair}:${cycleIdx}`;
        if (cyclePairings.has(cycleKey)) continue;

        available.push({ opponent_roster_id: opponentId, week });
      }
    }

    return available;
  }

  private async executeSkip(
    derby: MatchupDerby,
    client: any,
  ): Promise<MatchupDerby> {
    const currentPicker = this.getCurrentPicker(derby);
    if (!currentPicker) throw new ValidationException('No more picks remaining');

    const skippedUsers = derby.skippedUsers ?? [];
    const newSkippedUsers = skippedUsers.includes(currentPicker.user_id)
      ? [...skippedUsers]
      : [...skippedUsers, currentPicker.user_id];

    const newIndex = derby.currentPickIndex + 1;
    const pastAllPicks = newIndex >= derby.totalPicks;
    const isComplete = pastAllPicks && newSkippedUsers.length === 0;

    const updated = await this.derbyRepository.update(derby.id, {
      currentPickIndex: newIndex,
      skippedUsers: newSkippedUsers,
      status: isComplete ? 'complete' : 'active',
      pickDeadline: isComplete || pastAllPicks
        ? derby.pickDeadline
        : new Date(Date.now() + derby.pickTimer * 1000),
    }, client);
    if (!updated) throw new NotFoundException('Derby not found');

    return updated;
  }

  private async convertDerbyToMatchups(
    leagueId: string,
    picks: MatchupDerbyPick[],
    derbyOrder: MatchupDerbyOrderEntry[],
    totalWeeks: number,
    client: any,
  ): Promise<void> {
    // Group picks by week
    const weekPairings = new Map<number, Array<{ team1: number; team2: number }>>();
    for (const pick of picks) {
      if (!weekPairings.has(pick.week)) weekPairings.set(pick.week, []);
      weekPairings.get(pick.week)!.push({
        team1: pick.picker_roster_id,
        team2: pick.opponent_roster_id,
      });
    }

    // Build flat rows
    const rows: Array<{ week: number; matchup_id: number; roster_id: number }> = [];
    const allRosterIds = new Set(derbyOrder.map((e) => e.roster_id));

    for (let week = 1; week <= totalWeeks; week++) {
      const pairings = weekPairings.get(week) ?? [];
      let matchupCounter = 1;

      for (const pairing of pairings) {
        rows.push({ week, matchup_id: matchupCounter, roster_id: pairing.team1 });
        rows.push({ week, matchup_id: matchupCounter, roster_id: pairing.team2 });
        matchupCounter++;
      }

      // Find teams without a matchup this week (byes)
      const teamsInWeek = new Set<number>();
      for (const pairing of pairings) {
        teamsInWeek.add(pairing.team1);
        teamsInWeek.add(pairing.team2);
      }
      for (const rosterId of allRosterIds) {
        if (!teamsInWeek.has(rosterId)) {
          rows.push({ week, matchup_id: 0, roster_id: rosterId });
        }
      }
    }

    // Delete existing and insert new
    await this.matchupRepository.deleteByLeagueId(leagueId);
    if (rows.length > 0) {
      await this.matchupRepository.bulkInsert(leagueId, rows);
    }
  }

  private shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
