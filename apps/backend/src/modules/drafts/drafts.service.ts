import { DraftRepository } from './drafts.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { Draft, DraftPick, DEFAULT_DRAFT_SETTINGS, DraftType } from './drafts.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../../shared/exceptions';

export class DraftService {
  constructor(
    private readonly draftRepository: DraftRepository,
    private readonly leagueRepository: LeagueRepository,
  ) {}

  async createDraft(
    leagueId: string,
    userId: string,
    data: {
      type?: DraftType;
      settings?: Record<string, number>;
    },
  ): Promise<Draft> {
    // Verify league exists
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    // Only commissioners can create drafts
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can create drafts');
    }

    // Check no active draft exists
    const activeDraft = await this.draftRepository.findActiveDraftByLeagueId(leagueId);
    if (activeDraft) {
      throw new ConflictException('An active draft already exists for this league');
    }

    const type = data.type || 'snake';
    const settings = {
      ...DEFAULT_DRAFT_SETTINGS,
      teams: league.totalRosters,
      ...data.settings,
    };

    const draft = await this.draftRepository.create({
      leagueId,
      season: league.season,
      sport: league.sport,
      type,
      settings,
      metadata: {},
      createdBy: userId,
    });

    // Link draft to league
    await this.draftRepository.linkDraftToLeague(draft.id, leagueId);

    return draft;
  }

  async getDraft(draftId: string, userId: string): Promise<Draft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    // Verify membership
    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return draft;
  }

  async getLeagueDrafts(leagueId: string, userId: string): Promise<Draft[]> {
    // Verify league exists
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    // Verify membership
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return this.draftRepository.findByLeagueId(leagueId);
  }

  async updateDraft(
    draftId: string,
    userId: string,
    data: {
      type?: DraftType;
      startTime?: string | null;
      settings?: Record<string, number>;
      metadata?: Record<string, any>;
    },
  ): Promise<Draft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    // Only commissioners can update
    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can update drafts');
    }

    // Can only update pre_draft drafts
    if (draft.status !== 'pre_draft') {
      throw new ValidationException('Can only update drafts that have not started');
    }

    const updateData: Record<string, any> = {};
    if (data.type !== undefined) updateData.type = data.type;
    if (data.startTime !== undefined) updateData.startTime = data.startTime;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    if (data.settings) {
      updateData.settings = { ...draft.settings, ...data.settings };
    }

    const updated = await this.draftRepository.update(draftId, updateData);
    if (!updated) throw new NotFoundException('Draft not found');

    return updated;
  }

  async setDraftOrder(
    draftId: string,
    userId: string,
    draftOrder: Record<string, number>,
    slotToRosterId: Record<string, number>,
  ): Promise<Draft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    // Only commissioners can set order
    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can set draft order');
    }

    if (draft.status !== 'pre_draft') {
      throw new ValidationException('Can only set draft order before the draft starts');
    }

    // Validate that we have the right number of slots
    const league = await this.leagueRepository.findById(draft.leagueId);
    if (!league) throw new NotFoundException('League not found');

    const orderSlots = Object.values(draftOrder);
    const rosterSlots = Object.keys(slotToRosterId);

    if (orderSlots.length !== league.totalRosters) {
      throw new ValidationException(
        `Draft order must have exactly ${league.totalRosters} slots`
      );
    }

    if (rosterSlots.length !== league.totalRosters) {
      throw new ValidationException(
        `Slot to roster mapping must have exactly ${league.totalRosters} entries`
      );
    }

    const updated = await this.draftRepository.update(draftId, {
      draftOrder,
      slotToRosterId,
    });
    if (!updated) throw new NotFoundException('Draft not found');

    return updated;
  }

  async startDraft(draftId: string, userId: string): Promise<Draft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    // Only commissioners can start
    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can start drafts');
    }

    if (draft.status !== 'pre_draft') {
      throw new ValidationException('Draft has already started or is complete');
    }

    // Validate draft order is set
    if (Object.keys(draft.draftOrder).length === 0) {
      throw new ValidationException('Draft order must be set before starting');
    }

    if (Object.keys(draft.slotToRosterId).length === 0) {
      throw new ValidationException('Slot to roster mapping must be set before starting');
    }

    // Generate all pick slots
    await this.draftRepository.createPicks(
      draftId,
      draft.settings.rounds,
      draft.settings.teams,
      draft.type,
      draft.draftOrder,
      draft.slotToRosterId,
    );

    // Update draft status
    const updated = await this.draftRepository.update(draftId, {
      status: 'drafting',
      startTime: new Date().toISOString(),
    });

    // Update league status
    await this.draftRepository.updateLeagueStatus(draft.leagueId, 'drafting');

    if (!updated) throw new NotFoundException('Draft not found');
    return updated;
  }

  async getDraftPicks(draftId: string, userId: string): Promise<DraftPick[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    // Verify membership
    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return this.draftRepository.findPicksByDraftId(draftId);
  }

  async makePick(
    draftId: string,
    userId: string,
    playerId: string,
  ): Promise<DraftPick> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    if (draft.status !== 'drafting') {
      throw new ValidationException('Draft is not currently active');
    }

    // Verify membership
    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    // Find the next pick
    const nextPick = await this.draftRepository.findNextPick(draftId);
    if (!nextPick) {
      throw new ValidationException('All picks have been made');
    }

    // Verify it's this user's turn
    // Find which draft_slot this user owns by checking draft_order
    const userSlot = draft.draftOrder[userId];
    if (userSlot === undefined) {
      throw new ForbiddenException('You are not assigned a draft slot');
    }

    // Commissioners can pick for anyone, otherwise must be your turn
    const isCommissioner = member.role === 'commissioner';
    if (!isCommissioner && nextPick.draftSlot !== userSlot) {
      throw new ForbiddenException('It is not your turn to pick');
    }

    // Verify player isn't already picked
    const alreadyPicked = await this.draftRepository.isPlayerPicked(draftId, playerId);
    if (alreadyPicked) {
      throw new ConflictException('This player has already been picked');
    }

    // Determine who is picking (the owner of the current slot)
    const pickingUserId = isCommissioner && nextPick.draftSlot !== userSlot
      ? this.findUserBySlot(draft.draftOrder, nextPick.draftSlot) ?? userId
      : userId;

    // Make the pick
    const pick = await this.draftRepository.makePick(
      nextPick.id,
      playerId,
      pickingUserId,
      {},
    );

    if (!pick) throw new ConflictException('Pick was already made');

    // Update last_picked timestamp
    await this.draftRepository.update(draftId, {
      lastPicked: new Date().toISOString(),
    });

    // Check if draft is complete
    const totalPicks = await this.draftRepository.countTotalPicks(draftId);
    const picksMade = await this.draftRepository.countPicksMade(draftId);

    if (picksMade >= totalPicks) {
      await this.draftRepository.updateStatus(draftId, 'complete');
      await this.draftRepository.updateLeagueStatus(draft.leagueId, 'in_season');
    }

    return pick;
  }

  private findUserBySlot(draftOrder: Record<string, number>, slot: number): string | null {
    for (const [userId, userSlot] of Object.entries(draftOrder)) {
      if (userSlot === slot) return userId;
    }
    return null;
  }
}
