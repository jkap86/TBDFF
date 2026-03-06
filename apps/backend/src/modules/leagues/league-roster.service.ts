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

export class LeagueRosterService {
  constructor(
    private readonly leagueRepository: LeagueRepository,
    private readonly leagueMembersRepository: LeagueMembersRepository,
    private readonly leagueRostersRepository: LeagueRostersRepository,
    private readonly draftRepository: DraftRepository,
    private readonly systemMessages: SystemMessageService,
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
