import { DraftRepository } from './drafts.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { PlayerRepository } from '../players/players.repository';
import { DraftGateway } from './draft.gateway';
import { AutoPickService } from './auto-pick.service';
import {
  Draft,
  DraftPick,
  DraftMetadata,
  DEFAULT_DRAFT_SETTINGS,
  DraftType,
} from './drafts.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../../shared/exceptions';
import { findUserByRosterId, findRosterIdByUserId, assertBudgetExists } from './draft-helpers';

export class DraftService {
  /** Optional WebSocket gateway for broadcasting draft state changes */
  private draftGateway?: DraftGateway;

  constructor(
    private readonly draftRepository: DraftRepository,
    private readonly leagueRepository: LeagueRepository,
    private readonly playerRepository: PlayerRepository,
    private readonly autoPickService: AutoPickService,
  ) {
    // Wire up the rookie draft setup callback so AutoPickService can trigger it on vet draft completion
    this.autoPickService.setOnVetDraftCompleted((draft) => this.setupRookieDraftAfterVetCompletion(draft));
  }

  /** Inject the draft gateway after socket.io setup (avoids circular dependency at construction time) */
  setGateway(gateway: DraftGateway): void {
    this.draftGateway = gateway;
  }

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

    // Seed future draft picks for trading
    const rosters = await this.leagueRepository.findRostersByLeagueId(leagueId);
    const ownedRosters = rosters
      .filter((r) => r.ownerId)
      .map((r) => ({ rosterId: r.rosterId, ownerId: r.ownerId! }));
    if (ownedRosters.length > 0) {
      await this.draftRepository.createFutureDraftPicks(
        leagueId,
        league.season,
        settings.rounds,
        ownedRosters,
      );
    }

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
      metadata?: DraftMetadata;
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

    // Block manual order changes on rookie drafts when vet draft includes rookie picks
    if (draft.settings.player_type === 1) {
      const leagueDrafts = await this.draftRepository.findByLeagueId(draft.leagueId);
      const vetDraftWithPicks = leagueDrafts.find(
        (d) => d.settings.player_type === 2 && d.id !== draftId
          && d.settings.include_rookie_picks === 1,
      );
      if (vetDraftWithPicks) {
        throw new ValidationException('Rookie draft order is determined by vet draft picks');
      }
    }

    // Validate that we have the right number of slots
    const league = await this.leagueRepository.findById(draft.leagueId);
    if (!league) throw new NotFoundException('League not found');

    const slots = Object.values(draftOrder);

    // Validate slot values are unique and within 1..totalRosters
    const uniqueSlots = new Set(slots);
    if (uniqueSlots.size !== slots.length) {
      throw new ValidationException('Draft order slots must be unique');
    }
    for (const slot of slots) {
      if (slot < 1 || slot > league.totalRosters) {
        throw new ValidationException(`Draft order slot ${slot} is out of range (1-${league.totalRosters})`);
      }
    }

    // Validate slotToRosterId keys cover 1..N
    if (Object.keys(slotToRosterId).length !== league.totalRosters) {
      throw new ValidationException(
        `Slot to roster mapping must have exactly ${league.totalRosters} entries`,
      );
    }
    for (let i = 1; i <= league.totalRosters; i++) {
      if (slotToRosterId[String(i)] === undefined) {
        throw new ValidationException(`Slot to roster mapping must include slot ${i}`);
      }
    }

    // Validate roster IDs exist
    const rosters = await this.leagueRepository.findRostersByLeagueId(draft.leagueId);
    const validRosterIds = new Set(rosters.map((r) => r.rosterId));
    for (const rosterId of Object.values(slotToRosterId)) {
      if (!validRosterIds.has(rosterId)) {
        throw new ValidationException(`Invalid roster ID: ${rosterId}`);
      }
    }

    const updated = await this.draftRepository.update(draftId, {
      draftOrder,
      slotToRosterId,
    });
    if (!updated) throw new NotFoundException('Draft not found');

    return updated;
  }

  async startDraft(draftId: string, userId: string): Promise<Draft> {
    let draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    // Only commissioners can start
    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can start drafts');
    }

    if (draft.status !== 'pre_draft') {
      throw new ValidationException('Draft has already started or is complete');
    }

    // For slow auctions or rookie drafts with vet-assigned picks, auto-generate draft order
    if ((draft.type === 'slow_auction' || draft.settings.player_type === 1) && Object.keys(draft.draftOrder).length === 0) {
      const rosters = await this.leagueRepository.findRostersByLeagueId(draft.leagueId);
      const assignedRosters = rosters
        .filter((r) => r.ownerId)
        .sort((a, b) => a.rosterId - b.rosterId);

      if (assignedRosters.length === 0) {
        throw new ValidationException('No rosters have been assigned owners');
      }

      const draftOrder: Record<string, number> = {};
      const slotToRosterId: Record<string, number> = {};

      assignedRosters.forEach((roster, index) => {
        const slot = index + 1;
        draftOrder[roster.ownerId!] = slot;
        slotToRosterId[String(slot)] = roster.rosterId;
      });

      const updated = await this.draftRepository.update(draft.id, { draftOrder, slotToRosterId });
      if (!updated) throw new NotFoundException('Draft not found');
      draft = updated;
    }

    // Validate draft order is set
    if (Object.keys(draft.draftOrder).length === 0) {
      throw new ValidationException('Draft order must be set before starting');
    }

    if (Object.keys(draft.slotToRosterId).length === 0) {
      throw new ValidationException('Slot to roster mapping must be set before starting');
    }

    // Build pick overrides from traded future picks
    const futurePicks = await this.draftRepository.findFutureDraftPicksByLeagueSeason(
      draft.leagueId,
      draft.season,
    );
    const pickOverrides = new Map<string, number>();
    // Build a reverse map: userId -> draft slot
    const userToSlot: Record<string, number> = {};
    for (const [uid, slot] of Object.entries(draft.draftOrder)) {
      userToSlot[uid] = slot;
    }
    for (const fp of futurePicks) {
      if (fp.originalOwnerId !== fp.currentOwnerId) {
        const originalSlot = userToSlot[fp.originalOwnerId];
        if (originalSlot !== undefined) {
          pickOverrides.set(`${fp.round}:${originalSlot}`, fp.rosterId);
        }
      }
    }

    // For rookie drafts, apply pick assignments from the vet draft's rpick: selections
    if (draft.settings.player_type === 1) {
      const rpickOverrides = await this.computeRpickOverrides(draft);
      for (const [key, rosterId] of rpickOverrides) {
        pickOverrides.set(key, rosterId);
      }
    }

    // Initialize auction budgets if auction type
    let metadata: DraftMetadata = {};
    if (draft.type === 'auction') {
      const budgets: Record<string, number> = {};
      for (let slot = 1; slot <= draft.settings.teams; slot++) {
        const rosterId = draft.slotToRosterId[String(slot)];
        budgets[String(rosterId)] = draft.settings.budget;
      }
      metadata = {
        auction_budgets: budgets,
        current_nomination: null,
        nomination_deadline: new Date(
          Date.now() + (draft.settings.offering_timer || draft.settings.nomination_timer) * 1000,
        ).toISOString(),
      };
    } else if (draft.type === 'slow_auction') {
      // Slow auction budgets are computed from auction_lots table — just mark as initialized
      const budgets: Record<string, number> = {};
      for (let slot = 1; slot <= draft.settings.teams; slot++) {
        const rosterId = draft.slotToRosterId[String(slot)];
        budgets[String(rosterId)] = draft.settings.budget;
      }
      metadata = { auction_budgets: budgets };
    }

    // Validate every roster has a budget entry (fail-fast on misconfiguration)
    if (metadata.auction_budgets) {
      for (let slot = 1; slot <= draft.settings.teams; slot++) {
        const rosterId = draft.slotToRosterId[String(slot)];
        if (rosterId === undefined) {
          throw new ValidationException(
            `Slot ${slot} has no roster mapping — cannot initialize budget`,
          );
        }
        assertBudgetExists(metadata.auction_budgets, rosterId, 'draft start');
      }
    }

    // Slow auction skips pre-created pick slots — picks are created on lot settlement
    const pickArgs = draft.type !== 'slow_auction' ? {
      rounds: draft.settings.rounds,
      teams: draft.settings.teams,
      draftType: draft.type,
      draftOrder: draft.draftOrder,
      slotToRosterId: draft.slotToRosterId,
      pickOverrides: pickOverrides.size > 0 ? pickOverrides : undefined,
    } : undefined;

    // Atomically create picks + update draft status + league status in one transaction
    const updated = await this.draftRepository.startDraftAtomic(draftId, draft.leagueId, {
      status: 'drafting',
      startTime: new Date().toISOString(),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    }, pickArgs);

    if (!updated) throw new NotFoundException('Draft not found');

    // Schedule server-side timer for the first pick
    await this.autoPickService.schedulePickTimeout(draftId);

    return updated;
  }

  async getDraftPicks(draftId: string, userId: string): Promise<DraftPick[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    // Verify membership
    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    // For pre_draft, return projected picks so the board shows trade/rpick ownership
    if (draft.status === 'pre_draft') {
      return this.generateProjectedPicks(draft);
    }

    return this.draftRepository.findPicksByDraftId(draftId);
  }

  async makePick(
    draftId: string,
    userId: string,
    playerId: string,
  ): Promise<{ pick: DraftPick; chainedPicks: DraftPick[] }> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    if (draft.status !== 'drafting') {
      throw new ValidationException('Draft is not currently active');
    }

    if ((draft.metadata?.clock_state ?? 'running') === 'stopped') {
      throw new ValidationException('Draft is stopped by commissioner');
    }

    if (draft.type === 'auction' || draft.type === 'slow_auction') {
      throw new ValidationException('Use the nominate/bid endpoints for auction drafts');
    }

    // Verify membership
    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    // Find the next pick
    const nextPick = await this.draftRepository.findNextPick(draftId);
    if (!nextPick) {
      throw new ValidationException('All picks have been made');
    }

    // Verify it's this user's turn using roster_id (which reflects trades)
    const userRosterId = findRosterIdByUserId(draft, userId);
    if (userRosterId === null) {
      throw new ForbiddenException('You are not assigned a draft slot');
    }

    // Commissioners can pick for anyone, otherwise must be your turn
    const isCommissioner = member.role === 'commissioner';
    if (!isCommissioner && nextPick.rosterId !== userRosterId) {
      throw new ForbiddenException('It is not your turn to pick');
    }

    // Verify player isn't already picked
    const alreadyPicked = await this.draftRepository.isPlayerPicked(draftId, playerId);
    if (alreadyPicked) {
      throw new ConflictException('This player has already been picked');
    }

    // Determine who is picking (the owner of the current pick's roster)
    const pickingUserId =
      isCommissioner && nextPick.rosterId !== userRosterId
        ? (findUserByRosterId(draft.draftOrder, draft.slotToRosterId, nextPick.rosterId) ?? userId)
        : userId;

    // Build pick metadata
    let pickMetadata: Record<string, any>;
    if (playerId.startsWith('rpick:')) {
      // Rookie draft pick — parse round:pick from ID
      const parts = playerId.split(':');
      const rpRound = parseInt(parts[1], 10);
      const rpPick = parseInt(parts[2], 10);
      const pickLabel = `${rpRound}.${String(rpPick).padStart(2, '0')}`;
      pickMetadata = {
        rookie_pick: true,
        first_name: 'Rookie Pick',
        last_name: pickLabel,
        full_name: `Rookie Pick ${pickLabel}`,
        position: 'PICK',
        team: null,
        rookie_pick_round: rpRound,
        rookie_pick_number: rpPick,
      };
    } else {
      const player = await this.playerRepository.findById(playerId);
      pickMetadata = player
        ? {
            first_name: player.firstName,
            last_name: player.lastName,
            full_name: player.fullName,
            position: player.position,
            team: player.team,
          }
        : {};
    }

    // Make the pick
    const pick = await this.draftRepository.makePick(
      nextPick.id,
      playerId,
      pickingUserId,
      pickMetadata,
    );

    if (!pick) {
      // Distinguish idempotent retry (same player) from true conflict (different player)
      const existingPick = await this.draftRepository.findPickById(nextPick.id);
      if (existingPick?.playerId === playerId) {
        return { pick: existingPick, chainedPicks: [] };
      }
      throw new ConflictException('Pick was already made');
    }

    // Update last_picked timestamp
    await this.draftRepository.update(draftId, {
      lastPicked: new Date().toISOString(),
    });

    // Atomically complete draft + league in one transaction
    const completed = await this.draftRepository.completeAndUpdateLeague(draftId, draft.leagueId);
    if (completed) {
      await this.setupRookieDraftAfterVetCompletion(draft);
    }

    // Process auto-pick chain for subsequent autopick users
    const chainedPicks = completed ? [] : await this.autoPickService.scheduleAutoPickChain(draftId);

    // Schedule server-side timeout for the next pick
    if (!completed) {
      await this.autoPickService.schedulePickTimeout(draftId);
    }

    const finalDraft = await this.draftRepository.findById(draftId);
    if (finalDraft) {
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', {
        draft: finalDraft,
        pick,
        chained_picks: chainedPicks,
        server_time: new Date().toISOString(),
      });
    }

    return { pick, chainedPicks };
  }

  /** Compute rpick overrides for a rookie draft from the completed vet draft's picks. */
  private async computeRpickOverrides(draft: Draft): Promise<Map<string, number>> {
    const overrides = new Map<string, number>();
    if (draft.settings.player_type !== 1) return overrides;

    const leagueDrafts = await this.draftRepository.findByLeagueId(draft.leagueId);
    const vetDraft = leagueDrafts.find(
      (d) => d.settings.player_type === 2 && d.id !== draft.id
        && d.settings.include_rookie_picks === 1,
    );
    if (!vetDraft) return overrides;

    const vetPicks = await this.draftRepository.findPicksByDraftId(vetDraft.id);
    for (const vp of vetPicks) {
      if (vp.playerId?.startsWith('rpick:') && vp.pickedBy) {
        const parts = vp.playerId.split(':');
        const rpRound = parseInt(parts[1], 10);
        const rpPickInRound = parseInt(parts[2], 10);
        const vetPickerRosterId = findRosterIdByUserId(vetDraft, vp.pickedBy);
        if (vetPickerRosterId !== null) {
          overrides.set(`${rpRound}:${rpPickInRound}`, vetPickerRosterId);
        }
      }
    }
    return overrides;
  }

  /** Auto-set the rookie draft's order after a vet draft with include_rookie_picks completes. */
  private async setupRookieDraftAfterVetCompletion(completedDraft: Draft): Promise<void> {
    if (completedDraft.settings.include_rookie_picks !== 1) return;

    const leagueDrafts = await this.draftRepository.findByLeagueId(completedDraft.leagueId);
    const rookieDraft = leagueDrafts.find(
      (d) => d.settings.player_type === 1 && d.id !== completedDraft.id,
    );
    if (!rookieDraft || Object.keys(rookieDraft.slotToRosterId).length > 0) return;

    const rosters = await this.leagueRepository.findRostersByLeagueId(completedDraft.leagueId);
    const assigned = rosters
      .filter((r) => r.ownerId)
      .sort((a, b) => a.rosterId - b.rosterId);
    if (assigned.length === 0) return;

    const draftOrder: Record<string, number> = {};
    const slotToRosterId: Record<string, number> = {};
    assigned.forEach((roster, index) => {
      const slot = index + 1;
      draftOrder[roster.ownerId!] = slot;
      slotToRosterId[String(slot)] = roster.rosterId;
    });

    await this.draftRepository.update(rookieDraft.id, { draftOrder, slotToRosterId });
  }

  /** Generate projected pick entries for a pre_draft board (not persisted). */
  private async generateProjectedPicks(draft: Draft): Promise<DraftPick[]> {
    const { rounds, teams } = draft.settings;
    let slotToRosterId = draft.slotToRosterId;
    let draftOrder = draft.draftOrder;

    // Auto-compute if not set
    if (Object.keys(slotToRosterId).length === 0) {
      const rosters = await this.leagueRepository.findRostersByLeagueId(draft.leagueId);
      const assigned = rosters.filter((r) => r.ownerId).sort((a, b) => a.rosterId - b.rosterId);
      slotToRosterId = {};
      draftOrder = {};
      assigned.forEach((r, i) => {
        slotToRosterId[String(i + 1)] = r.rosterId;
        if (r.ownerId) draftOrder[r.ownerId] = i + 1;
      });
    }

    // Compute overrides
    const pickOverrides = new Map<string, number>();

    // Trade overrides
    const futurePicks = await this.draftRepository.findFutureDraftPicksByLeagueSeason(
      draft.leagueId,
      draft.season,
    );
    const userToSlot: Record<string, number> = {};
    for (const [uid, slot] of Object.entries(draftOrder)) {
      userToSlot[uid] = slot;
    }
    for (const fp of futurePicks) {
      if (fp.originalOwnerId !== fp.currentOwnerId) {
        const originalSlot = userToSlot[fp.originalOwnerId];
        if (originalSlot !== undefined) {
          pickOverrides.set(`${fp.round}:${originalSlot}`, fp.rosterId);
        }
      }
    }

    // Rpick overrides for rookie drafts
    if (draft.settings.player_type === 1) {
      const rpickOverrides = await this.computeRpickOverrides(draft);
      for (const [key, rosterId] of rpickOverrides) {
        pickOverrides.set(key, rosterId);
      }
    }

    // Generate virtual picks
    const picks: DraftPick[] = [];
    for (let round = 1; round <= rounds; round++) {
      for (let pickInRound = 1; pickInRound <= teams; pickInRound++) {
        let draftSlot: number;
        if (draft.type === 'snake') {
          draftSlot = round % 2 === 1 ? pickInRound : teams - pickInRound + 1;
        } else if (draft.type === '3rr') {
          if (round <= 2) {
            draftSlot = round % 2 === 1 ? pickInRound : teams - pickInRound + 1;
          } else {
            draftSlot = round % 2 === 0 ? pickInRound : teams - pickInRound + 1;
          }
        } else {
          draftSlot = pickInRound;
        }

        const overallPick = (round - 1) * teams + pickInRound;
        const rosterId = pickOverrides.get(`${round}:${draftSlot}`)
          ?? slotToRosterId[String(draftSlot)]
          ?? draftSlot;

        picks.push(new DraftPick(
          `projected-${round}-${draftSlot}`,
          draft.id,
          null,
          null,
          rosterId as number,
          round,
          overallPick,
          draftSlot,
          false,
          null,
          {},
          null,
          new Date(),
        ));
      }
    }

    return picks;
  }
}
