import { LeagueRepository } from './leagues.repository';
import { LeagueMembersRepository } from './league-members.repository';
import { LeagueRostersRepository } from './league-rosters.repository';
import { Roster, LeagueMember } from './leagues.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../../shared/exceptions';
import { DraftRepository } from '../drafts/drafts.repository';
import { SystemMessageService } from '../chat/system-message.service';
import { PlayerRepository } from '../players/players.repository';

// Which player positions are eligible for each starter slot label.
const SLOT_ELIGIBILITY: Record<string, ReadonlySet<string>> = {
  QB: new Set(['QB']),
  RB: new Set(['RB']),
  WR: new Set(['WR']),
  TE: new Set(['TE']),
  K: new Set(['K']),
  DEF: new Set(['DEF']),
  FLEX: new Set(['RB', 'WR', 'TE']),
  SUPER_FLEX: new Set(['QB', 'RB', 'WR', 'TE']),
  REC_FLEX: new Set(['WR', 'TE']),
  WRRB_FLEX: new Set(['RB', 'WR']),
};

export class LeagueRosterService {
  constructor(
    private readonly leagueRepository: LeagueRepository,
    private readonly leagueMembersRepository: LeagueMembersRepository,
    private readonly leagueRostersRepository: LeagueRostersRepository,
    private readonly draftRepository: DraftRepository,
    private readonly systemMessages: SystemMessageService,
    private readonly playerRepository: PlayerRepository,
  ) {}

  async getLeagueRosters(leagueId: string, userId: string): Promise<Roster[]> {
    const member = await this.leagueMembersRepository.findMember(leagueId, userId);
    if (!member) throw new NotFoundException('League not found');

    return this.leagueRostersRepository.findRostersByLeagueId(leagueId);
  }

  async assignMemberToRoster(
    leagueId: string,
    requestingUserId: string,
    targetUserId: string,
    rosterId: number,
  ): Promise<{ roster: Roster; member: LeagueMember }> {
    // 1. Verify requester is commissioner
    const requester = await this.leagueMembersRepository.findMember(leagueId, requestingUserId);
    if (!requester || requester.role !== 'commissioner') {
      throw new ForbiddenException('Only the commissioner can assign rosters');
    }

    // 2. Verify target is a league member
    const target = await this.leagueMembersRepository.findMember(leagueId, targetUserId);
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'commissioner') {
      throw new ValidationException('Commissioner is already assigned to a roster');
    }

    // 3. Check target doesn't already own a roster
    const existingRoster = await this.leagueRostersRepository.findRosterByOwner(leagueId, targetUserId);
    if (existingRoster) {
      throw new ConflictException('User is already assigned to a roster');
    }

    // 4. Assign roster owner and promote to member (transactional)
    const result = await this.leagueRostersRepository.assignRosterOwnerTransaction(leagueId, rosterId, targetUserId);

    // 5. Seed future draft picks so they're available in the Trade Center
    // even before a draft is created. Use active draft rounds if available,
    // otherwise fall back to the league's draft_rounds setting.
    const league = await this.leagueRepository.findById(leagueId);
    if (league) {
      const activeDraft = await this.draftRepository.findActiveDraftByLeagueId(leagueId);
      const rounds = activeDraft?.settings.rounds ?? league.settings.draft_rounds;
      await this.draftRepository.createFutureDraftPicks(
        leagueId,
        league.season,
        rounds,
        [{ rosterId, ownerId: targetUserId }],
      );
    }

    // 6. Sync draft_order for any active drafts that have this roster in slot_to_roster_id
    await this.syncDraftOrderForRosterAssignment(leagueId, rosterId, targetUserId);

    try {
      await this.systemMessages.send(leagueId, `${target.username} was assigned to a roster`);
    } catch { /* non-fatal */ }

    // Auto-transition: not_filled → offseason for free leagues when all rosters filled
    try {
      const currentLeague = league ?? await this.leagueRepository.findById(leagueId);
      if (currentLeague && currentLeague.status === 'not_filled') {
        const buyIn = (currentLeague.settings as unknown as Record<string, unknown>).buy_in as number | undefined;
        if (!buyIn || buyIn === 0) {
          const allRosters = await this.leagueRostersRepository.findRostersByLeagueId(leagueId);
          const assignedCount = allRosters.filter((r) => r.ownerId).length;
          if (assignedCount >= allRosters.length) {
            await this.leagueRepository.update(leagueId, { status: 'offseason' });
            try {
              await this.systemMessages.send(leagueId, 'All rosters filled — league moved to offseason');
            } catch { /* non-fatal */ }
          }
        }
      }
    } catch { /* non-fatal */ }

    return result;
  }

  async updateLineup(
    leagueId: string,
    requestingUserId: string,
    rosterId: number,
    starters: string[],
  ): Promise<Roster> {
    // 1. Verify league exists and is in-season
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');
    if (league.status !== 'reg_season' && league.status !== 'post_season') {
      throw new ForbiddenException('Lineup changes are only allowed during the regular and post season');
    }

    // 2. Verify requester is a league member
    const member = await this.leagueMembersRepository.findMember(leagueId, requestingUserId);
    if (!member) throw new NotFoundException('Not a member of this league');

    // 3. Find the roster and verify ownership
    const rosters = await this.leagueRostersRepository.findRostersByLeagueId(leagueId);
    const roster = rosters.find((r) => r.rosterId === rosterId);
    if (!roster) throw new NotFoundException('Roster not found');
    if (roster.ownerId !== requestingUserId && member.role !== 'commissioner') {
      throw new ForbiddenException('You can only edit your own lineup');
    }

    // 4. Validate all starters are on the roster
    const rosterPlayerSet = new Set(roster.players);
    for (const pid of starters) {
      if (!rosterPlayerSet.has(pid)) {
        throw new ValidationException(`Player ${pid} is not on this roster`);
      }
    }

    // 5. Validate no duplicate starters
    if (new Set(starters).size !== starters.length) {
      throw new ValidationException('Lineup contains duplicate players');
    }

    // 6. Validate starters length matches non-BN/non-IR slot count
    const starterSlots = league.rosterPositions.filter(
      (p) => p !== 'BN' && p !== 'IR',
    );
    if (starters.length !== starterSlots.length) {
      throw new ValidationException(
        `Starters array must have exactly ${starterSlots.length} entries`,
      );
    }

    // 7. Validate slot eligibility (starters[i] must fit starterSlots[i])
    const players = await this.playerRepository.findByIds(starters);
    const playerById = new Map(players.map((p) => [p.id, p]));
    for (let i = 0; i < starters.length; i++) {
      const pid = starters[i];
      const slot = starterSlots[i];
      const eligible = SLOT_ELIGIBILITY[slot];
      if (!eligible) {
        throw new ValidationException(`Unknown roster slot: ${slot}`);
      }
      const player = playerById.get(pid);
      if (!player) {
        throw new ValidationException(`Player ${pid} not found`);
      }
      const positions = new Set<string>([
        ...(player.fantasyPositions ?? []),
        ...(player.position ? [player.position] : []),
      ]);
      const fits = Array.from(positions).some((pos) => eligible.has(pos));
      if (!fits) {
        throw new ValidationException(
          `Player ${pid} (${player.position ?? 'unknown'}) is not eligible for ${slot}`,
        );
      }
    }

    return this.leagueRostersRepository.updateStarters(leagueId, rosterId, starters);
  }

  async unassignMemberFromRoster(
    leagueId: string,
    requestingUserId: string,
    targetUserId: string,
  ): Promise<void> {
    // 1. Verify requester is commissioner
    const requester = await this.leagueMembersRepository.findMember(leagueId, requestingUserId);
    if (!requester || requester.role !== 'commissioner') {
      throw new ForbiddenException('Only the commissioner can unassign rosters');
    }

    // 2. Verify target exists and is not the commissioner
    const target = await this.leagueMembersRepository.findMember(leagueId, targetUserId);
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'commissioner') {
      throw new ForbiddenException('Cannot unassign the commissioner from their roster');
    }

    // 3. Unassign roster and demote to spectator (transactional)
    await this.leagueRostersRepository.unassignRosterOwnerTransaction(leagueId, targetUserId);

    // 4. Remove user from draft_order in any active drafts
    await this.syncDraftOrderForRosterUnassignment(leagueId, targetUserId);
  }

  private async syncDraftOrderForRosterAssignment(
    leagueId: string,
    rosterId: number,
    userId: string,
  ): Promise<void> {
    const drafts = await this.draftRepository.findByLeagueId(leagueId);
    for (const draft of drafts) {
      if (draft.status !== 'pre_draft' && draft.status !== 'drafting') continue;

      // Find the slot assigned to this roster
      const slotEntry = Object.entries(draft.slotToRosterId).find(
        ([, rid]) => rid === rosterId,
      );
      if (!slotEntry) continue;

      const slot = Number(slotEntry[0]);
      const updatedOrder = { ...draft.draftOrder, [userId]: slot };
      await this.draftRepository.update(draft.id, { draftOrder: updatedOrder });
    }
  }

  private async syncDraftOrderForRosterUnassignment(
    leagueId: string,
    userId: string,
  ): Promise<void> {
    const drafts = await this.draftRepository.findByLeagueId(leagueId);
    for (const draft of drafts) {
      if (draft.status !== 'pre_draft' && draft.status !== 'drafting') continue;
      if (!(userId in draft.draftOrder)) continue;

      const { [userId]: _, ...updatedOrder } = draft.draftOrder;
      await this.draftRepository.update(draft.id, { draftOrder: updatedOrder });
    }
  }
}
