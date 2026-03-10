import { MatchupDerbyRepository } from './matchup-derby.repository';
import { MatchupRepository } from './matchups.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { LeagueMembersRepository } from '../leagues/league-members.repository';
import { LeagueRostersRepository } from '../leagues/league-rosters.repository';
import { DraftRepository } from '../drafts/drafts.repository';
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
    private readonly leagueMembersRepository: LeagueMembersRepository,
    private readonly leagueRostersRepository: LeagueRostersRepository,
    private readonly draftRepository: DraftRepository,
  ) {}

  setGateway(gateway: MatchupDerbyGateway): void {
    this.gateway = gateway;
  }

  async startDerby(leagueId: string, userId: string): Promise<MatchupDerby> {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const member = await this.leagueMembersRepository.findMember(leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can start a matchup derby');
    }

    if (league.status !== 'not_filled' && league.status !== 'offseason' && league.status !== 'reg_season') {
      throw new ValidationException('Matchup derby can only be started during not filled, offseason, or regular season');
    }

    if ((league.settings.matchup_type ?? 0) !== 1) {
      throw new ValidationException('This league is not configured for matchup derby');
    }

    const existing = await this.derbyRepository.findActiveByLeagueId(leagueId);
    if (existing) {
      throw new ConflictException('A matchup derby is already active for this league');
    }

    const rosters = await this.leagueRostersRepository.findRostersByLeagueId(leagueId);
    const assignedRosters = rosters.filter((r) => r.ownerId);

    if (assignedRosters.length < 2) {
      throw new ValidationException('At least 2 rosters must have assigned owners to start a matchup derby');
    }

    const members = await this.leagueMembersRepository.findMembersByLeagueId(leagueId);
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

    const member = await this.leagueMembersRepository.findMember(leagueId, userId);
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

    const member = await this.leagueMembersRepository.findMember(leagueId, userId);
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

    const member = await this.leagueMembersRepository.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const isCommissioner = member.role === 'commissioner';
    const playoffWeekStart = league.settings.playoff_week_start ?? 15;
    const regularSeasonWeeks = playoffWeekStart - 1;

    const rosters = await this.leagueRostersRepository.findRostersByLeagueId(leagueId);
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
        // Past all picks — check if derby should complete (skipped users with no options)
        if ((freshDerby.skippedUsers ?? []).length > 0) {
          return this.tryCompleteDerby(freshDerby, allRosterIds, regularSeasonWeeks, client);
        }
        throw new ValidationException('No more picks remaining');
      }

      // Check timeout action: skip or autopick
      if ((freshDerby.timeoutAction ?? 0) === 1) {
        return this.executeSkip(freshDerby, allRosterIds, regularSeasonWeeks, client);
      }

      // Autopick: random valid cell
      const available = this.getAvailableCells(
        freshDerby,
        currentPicker.roster_id,
        allRosterIds,
        regularSeasonWeeks,
      );

      if (available.length === 0) {
        // No valid cells — skip this user (and chain-skip subsequent no-option pickers)
        return this.executeSkip(freshDerby, allRosterIds, regularSeasonWeeks, client);
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

    // On completion, convert to matchups and check auto-transition
    if (isComplete) {
      await this.convertDerbyToMatchups(derby.leagueId, newPicks, derby.derbyOrder, totalWeeks, client);
      // Auto-transition to reg_season if all drafts are complete
      const league = await this.leagueRepository.findById(derby.leagueId);
      if (league && league.status === 'offseason') {
        const drafts = await this.draftRepository.findByLeagueId(derby.leagueId);
        const allComplete = drafts.length > 0 && drafts.every((d) => d.status === 'complete');
        if (allComplete) {
          await this.leagueRepository.update(derby.leagueId, { status: 'reg_season' });
        }
      }
      return updated;
    }

    // Chain-skip any subsequent pickers who have no available cells
    if (!isSkippedUser) {
      const allRosterIds = derby.derbyOrder.map((e: any) => e.roster_id);
      return this.chainSkipNoOptions(updated, allRosterIds, totalWeeks, client);
    }

    // If a skipped user just picked and we're past all picks, check completion
    if (updated.currentPickIndex >= updated.totalPicks) {
      const allRosterIds = derby.derbyOrder.map((e: any) => e.roster_id);
      return this.tryCompleteDerby(updated, allRosterIds, totalWeeks, client);
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

    // Global round-robin: must complete a full round before any rematches.
    // Count how many times each pair has played across all picks.
    const allRosterIds = derby.derbyOrder.map((e: any) => e.roster_id);
    const pairCounts = new Map<string, number>();
    for (const p of picks) {
      const pairKey = `${Math.min(p.picker_roster_id, p.opponent_roster_id)}:${Math.max(p.picker_roster_id, p.opponent_roster_id)}`;
      pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
    }

    // Find the minimum count across ALL possible pairs (unpicked pairs = 0)
    let minPairCount = Infinity;
    for (let i = 0; i < allRosterIds.length; i++) {
      for (let j = i + 1; j < allRosterIds.length; j++) {
        const key = `${Math.min(allRosterIds[i], allRosterIds[j])}:${Math.max(allRosterIds[i], allRosterIds[j])}`;
        const count = pairCounts.get(key) ?? 0;
        if (count < minPairCount) minPairCount = count;
      }
    }
    if (minPairCount === Infinity) minPairCount = 0;

    const thisPairKey = `${Math.min(pickerRosterId, opponentRosterId)}:${Math.max(pickerRosterId, opponentRosterId)}`;
    const thisPairCount = pairCounts.get(thisPairKey) ?? 0;
    if (thisPairCount > minPairCount) {
      throw new ConflictException(
        'All other teams must complete their round-robin matchups before you can rematch this opponent'
      );
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

    // Build lookup sets for efficiency
    const pickerWeeks = new Set<number>();
    const rosterWeeks = new Map<number, Set<number>>();
    const pairCounts = new Map<string, number>();

    for (const p of picks) {
      // Track which weeks each roster is busy
      if (!rosterWeeks.has(p.picker_roster_id)) rosterWeeks.set(p.picker_roster_id, new Set());
      if (!rosterWeeks.has(p.opponent_roster_id)) rosterWeeks.set(p.opponent_roster_id, new Set());
      rosterWeeks.get(p.picker_roster_id)!.add(p.week);
      rosterWeeks.get(p.opponent_roster_id)!.add(p.week);

      if (p.picker_roster_id === pickerRosterId || p.opponent_roster_id === pickerRosterId) {
        pickerWeeks.add(p.week);
      }

      // Track global pair counts
      const pairKey = `${Math.min(p.picker_roster_id, p.opponent_roster_id)}:${Math.max(p.picker_roster_id, p.opponent_roster_id)}`;
      pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
    }

    // Find min pair count across ALL possible pairs (unpicked = 0)
    let minPairCount = Infinity;
    for (let i = 0; i < allRosterIds.length; i++) {
      for (let j = i + 1; j < allRosterIds.length; j++) {
        const key = `${Math.min(allRosterIds[i], allRosterIds[j])}:${Math.max(allRosterIds[i], allRosterIds[j])}`;
        const count = pairCounts.get(key) ?? 0;
        if (count < minPairCount) minPairCount = count;
      }
    }
    if (minPairCount === Infinity) minPairCount = 0;

    for (let week = 1; week <= totalWeeks; week++) {
      // Skip if picker already plays this week
      if (pickerWeeks.has(week)) continue;

      for (const opponentId of allRosterIds) {
        if (opponentId === pickerRosterId) continue;

        // Skip if opponent already plays this week
        if (rosterWeeks.get(opponentId)?.has(week)) continue;

        // Skip if this pair is ahead of the round-robin minimum
        const pairKey = `${Math.min(pickerRosterId, opponentId)}:${Math.max(pickerRosterId, opponentId)}`;
        if ((pairCounts.get(pairKey) ?? 0) > minPairCount) continue;

        available.push({ opponent_roster_id: opponentId, week });
      }
    }

    return available;
  }

  private async executeSkip(
    derby: MatchupDerby,
    allRosterIds: number[],
    totalWeeks: number,
    client: any,
  ): Promise<MatchupDerby> {
    let current = derby;

    // Skip current picker and chain-skip any subsequent pickers with no options
    while (true) {
      const picker = this.getCurrentPicker(current);
      if (!picker) break; // past all picks

      const skippedUsers = current.skippedUsers ?? [];
      const newSkippedUsers = skippedUsers.includes(picker.user_id)
        ? [...skippedUsers]
        : [...skippedUsers, picker.user_id];

      const newIndex = current.currentPickIndex + 1;
      const pastAllPicks = newIndex >= current.totalPicks;

      const updated = await this.derbyRepository.update(current.id, {
        currentPickIndex: newIndex,
        skippedUsers: newSkippedUsers,
        status: 'active',
        pickDeadline: pastAllPicks
          ? current.pickDeadline
          : new Date(Date.now() + current.pickTimer * 1000),
      }, client);
      if (!updated) throw new NotFoundException('Derby not found');
      current = updated;

      if (pastAllPicks) break;

      // Check if the next picker has available cells; if so, stop chaining
      const nextPicker = this.getCurrentPicker(current);
      if (!nextPicker) break;
      const nextAvailable = this.getAvailableCells(current, nextPicker.roster_id, allRosterIds, totalWeeks);
      if (nextAvailable.length > 0) break;
    }

    // If past all picks, check whether the derby should complete
    if (current.currentPickIndex >= current.totalPicks) {
      return this.tryCompleteDerby(current, allRosterIds, totalWeeks, client);
    }

    return current;
  }

  /**
   * If all skipped users have no available cells, complete the derby.
   * Otherwise keep it active with a fresh deadline for the skipped-user phase.
   */
  private async tryCompleteDerby(
    derby: MatchupDerby,
    allRosterIds: number[],
    totalWeeks: number,
    client: any,
  ): Promise<MatchupDerby> {
    const skippedUsers = derby.skippedUsers ?? [];

    // Check if any skipped user still has options
    const anyCanPick = skippedUsers.some((userId) => {
      const entry = derby.derbyOrder.find((e: any) => e.user_id === userId);
      if (!entry) return false;
      return this.getAvailableCells(derby, entry.roster_id, allRosterIds, totalWeeks).length > 0;
    });

    if (anyCanPick) {
      // Skipped users still have options — reset deadline so they can pick
      const updated = await this.derbyRepository.update(derby.id, {
        pickDeadline: new Date(Date.now() + derby.pickTimer * 1000),
      }, client);
      return updated ?? derby;
    }

    // No one can pick — complete the derby
    const completed = await this.derbyRepository.update(derby.id, {
      status: 'complete',
      completedAt: new Date(),
    }, client);
    if (!completed) throw new NotFoundException('Derby not found');

    await this.convertDerbyToMatchups(derby.leagueId, derby.picks, derby.derbyOrder, totalWeeks, client);

    const league = await this.leagueRepository.findById(derby.leagueId);
    if (league && league.status === 'offseason') {
      const drafts = await this.draftRepository.findByLeagueId(derby.leagueId);
      const allComplete = drafts.length > 0 && drafts.every((d) => d.status === 'complete');
      if (allComplete) {
        await this.leagueRepository.update(derby.leagueId, { status: 'reg_season' });
      }
    }

    return completed;
  }

  /**
   * After a normal pick advances the index, chain-skip any subsequent
   * pickers who have no available cells.
   */
  private async chainSkipNoOptions(
    derby: MatchupDerby,
    allRosterIds: number[],
    totalWeeks: number,
    client: any,
  ): Promise<MatchupDerby> {
    const nextPicker = this.getCurrentPicker(derby);
    if (!nextPicker) {
      // Past all picks after the pick — check completion
      return this.tryCompleteDerby(derby, allRosterIds, totalWeeks, client);
    }

    const available = this.getAvailableCells(derby, nextPicker.roster_id, allRosterIds, totalWeeks);
    if (available.length > 0) return derby; // next picker has options

    // Next picker has no options — delegate to executeSkip which handles chaining
    return this.executeSkip(derby, allRosterIds, totalWeeks, client);
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
