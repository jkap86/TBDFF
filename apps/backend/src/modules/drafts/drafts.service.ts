import { DraftRepository } from './drafts.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { PlayerRepository } from '../players/players.repository';
import { DraftGateway } from './draft.gateway';
import {
  Draft,
  DraftPick,
  DraftMetadata,
  DEFAULT_DRAFT_SETTINGS,
  DraftType,
} from './drafts.model';
import { Player } from '../players/players.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../../shared/exceptions';
import { findUserBySlot, findUserByRosterId, findRosterIdByUserId, getMaxPlayersPerTeam } from './draft-helpers';

export class DraftService {
  /** Per-draft lock to prevent concurrent processAutoPickChain executions */
  private autoPickChainLocks = new Map<string, Promise<DraftPick[]>>();
  /** Optional WebSocket gateway for broadcasting draft state changes */
  private draftGateway?: DraftGateway;

  constructor(
    private readonly draftRepository: DraftRepository,
    private readonly leagueRepository: LeagueRepository,
    private readonly playerRepository: PlayerRepository,
  ) {}

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

    // Validate that we have the right number of slots
    const league = await this.leagueRepository.findById(draft.leagueId);
    if (!league) throw new NotFoundException('League not found');

    const slots = Object.values(draftOrder);

    if (slots.length !== league.totalRosters) {
      throw new ValidationException(`Draft order must have exactly ${league.totalRosters} slots`);
    }

    // Validate slot values are unique sequential 1..N
    const uniqueSlots = new Set(slots);
    if (uniqueSlots.size !== slots.length) {
      throw new ValidationException('Draft order slots must be unique');
    }
    for (let i = 1; i <= league.totalRosters; i++) {
      if (!uniqueSlots.has(i)) {
        throw new ValidationException(`Draft order must include slot ${i}`);
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

    // Generate all pick slots
    await this.draftRepository.createPicks(
      draftId,
      draft.settings.rounds,
      draft.settings.teams,
      draft.type,
      draft.draftOrder,
      draft.slotToRosterId,
      pickOverrides.size > 0 ? pickOverrides : undefined,
    );

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
    }

    // Atomically update draft status to 'drafting' and league status in one transaction
    const updated = await this.draftRepository.startDraftAtomic(draftId, draft.leagueId, {
      status: 'drafting',
      startTime: new Date().toISOString(),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    });

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
  ): Promise<{ pick: DraftPick; chainedPicks: DraftPick[] }> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    if (draft.status !== 'drafting') {
      throw new ValidationException('Draft is not currently active');
    }

    if (draft.type === 'auction') {
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

    // Look up player for metadata
    const player = await this.playerRepository.findById(playerId);
    const pickMetadata = player
      ? {
          first_name: player.firstName,
          last_name: player.lastName,
          full_name: player.fullName,
          position: player.position,
          team: player.team,
        }
      : {};

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

    // Process auto-pick chain for subsequent autopick users
    const chainedPicks = completed ? [] : await this.scheduleAutoPickChain(draftId);

    const finalDraft = await this.draftRepository.findById(draftId);
    if (finalDraft) {
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', {
        draft: finalDraft,
        pick,
        chained_picks: chainedPicks,
      });
    }

    return { pick, chainedPicks };
  }

  async autoPick(
    draftId: string,
    userId: string,
  ): Promise<{ pick: DraftPick; chainedPicks: DraftPick[] }> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    if (draft.status !== 'drafting') {
      throw new ValidationException('Draft is not currently active');
    }

    if (draft.type === 'auction') {
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

    // Check timer has expired OR user is commissioner
    const isCommissioner = member.role === 'commissioner';
    const referenceTime = draft.lastPicked || draft.startTime;
    if (referenceTime && !isCommissioner) {
      const deadline = new Date(referenceTime).getTime() + draft.settings.pick_timer * 1000;
      if (Date.now() < deadline) {
        throw new ValidationException('Pick timer has not expired yet');
      }
    }

    // Determine the user who owns the current pick's roster (accounts for trades)
    const pickOwner = findUserByRosterId(draft.draftOrder, draft.slotToRosterId, nextPick.rosterId);
    if (!pickOwner) {
      throw new ValidationException('Could not determine pick owner for auto-pick');
    }

    // Try the user's queue first, fall back to best available
    console.log(`[auto-pick] draft=${draftId} slot=${nextPick.draftSlot} rosterId=${nextPick.rosterId} pickOwner=${pickOwner} triggeredBy=${userId}`);
    const queuedPlayer = await this.draftRepository.findFirstAvailableFromQueue(draftId, pickOwner);
    console.log(`[auto-pick] queueResult=${queuedPlayer ? `${queuedPlayer.fullName} (${queuedPlayer.id})` : 'null (no queued player)'}`);
    const bestPlayer = queuedPlayer ?? (await this.draftRepository.findBestAvailable(draftId));
    if (!bestPlayer) {
      throw new ValidationException('No available players to auto-pick');
    }
    console.log(`[auto-pick] finalPick=${bestPlayer.fullName} (${bestPlayer.id}) source=${queuedPlayer ? 'queue' : 'BPA'}`);

    // Make the pick using the selected player
    const pickMetadata = {
      first_name: bestPlayer.firstName,
      last_name: bestPlayer.lastName,
      full_name: bestPlayer.fullName,
      position: bestPlayer.position,
      team: bestPlayer.team,
      auto_pick: true,
    };

    const pick = await this.draftRepository.makePick(
      nextPick.id,
      bestPlayer.id,
      pickOwner,
      pickMetadata,
    );

    if (!pick) throw new ConflictException('Pick was already made');

    // Update last_picked timestamp
    await this.draftRepository.update(draftId, {
      lastPicked: new Date().toISOString(),
    });

    // Timeout triggers autopick mode for the timed-out user
    await this.draftRepository.addAutoPickUser(draftId, pickOwner);

    // Atomically complete draft + league in one transaction
    const completed = await this.draftRepository.completeAndUpdateLeague(draftId, draft.leagueId);

    // Process auto-pick chain for subsequent autopick users
    const chainedPicks = completed ? [] : await this.scheduleAutoPickChain(draftId);

    const finalDraft = await this.draftRepository.findById(draftId);
    if (finalDraft) {
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', {
        draft: finalDraft,
        pick,
        chained_picks: chainedPicks,
      });
    }

    return { pick, chainedPicks };
  }

  async toggleAutoPick(
    draftId: string,
    userId: string,
  ): Promise<{ draft: Draft; picks: DraftPick[] }> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    if (draft.status !== 'drafting') {
      throw new ValidationException('Draft is not currently active');
    }

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const userSlot = draft.draftOrder[userId];
    if (userSlot === undefined) {
      throw new ForbiddenException('You are not assigned a draft slot');
    }

    const autoPickUsers: string[] = draft.metadata?.auto_pick_users ?? [];
    const isCurrentlyOn = autoPickUsers.includes(userId);

    if (isCurrentlyOn) {
      const updatedDraft =
        (await this.draftRepository.removeAutoPickUser(draftId, userId)) ?? draft;
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updatedDraft });
      return { draft: updatedDraft, picks: [] };
    }

    // Toggle ON
    await this.draftRepository.addAutoPickUser(draftId, userId);

    // If it's currently this user's turn, chain auto-picks starting now
    const chainedPicks = await this.scheduleAutoPickChain(draftId);

    const finalDraft = await this.draftRepository.findById(draftId);
    if (finalDraft) {
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', {
        draft: finalDraft,
        chained_picks: chainedPicks,
      });
    }
    return { draft: finalDraft ?? draft, picks: chainedPicks };
  }

  private async processAutoPickChain(draftId: string): Promise<DraftPick[]> {
    const chainedPicks: DraftPick[] = [];
    const MAX_CHAIN = 50;

    for (let i = 0; i < MAX_CHAIN; i++) {
      const draft = await this.draftRepository.findById(draftId);
      if (!draft || draft.status !== 'drafting') break;

      const nextPick = await this.draftRepository.findNextPick(draftId);
      if (!nextPick) break;

      const autoPickUsers: string[] = draft.metadata?.auto_pick_users ?? [];
      const pickOwner = findUserByRosterId(draft.draftOrder, draft.slotToRosterId, nextPick.rosterId);
      if (!pickOwner || !autoPickUsers.includes(pickOwner)) break;

      const queuedPlayer = await this.draftRepository.findFirstAvailableFromQueue(
        draftId,
        pickOwner,
      );
      const bestPlayer = queuedPlayer ?? (await this.draftRepository.findBestAvailable(draftId));
      if (!bestPlayer) break;

      const pickMetadata = {
        first_name: bestPlayer.firstName,
        last_name: bestPlayer.lastName,
        full_name: bestPlayer.fullName,
        position: bestPlayer.position,
        team: bestPlayer.team,
        auto_pick: true,
      };

      const pick = await this.draftRepository.makePick(
        nextPick.id,
        bestPlayer.id,
        pickOwner,
        pickMetadata,
      );

      if (!pick) break;

      await this.draftRepository.update(draftId, {
        lastPicked: new Date().toISOString(),
      });

      chainedPicks.push(pick);

      const completed = await this.draftRepository.completeAndUpdateLeague(draftId, draft.leagueId);
      if (completed) break;
    }

    return chainedPicks;
  }

  /**
   * Serialize processAutoPickChain calls per draft to prevent concurrent
   * auto-pick chains from racing and creating duplicate picks.
   */
  private scheduleAutoPickChain(draftId: string): Promise<DraftPick[]> {
    const existing = this.autoPickChainLocks.get(draftId);
    const run = (existing ?? Promise.resolve([] as DraftPick[]))
      .then(() => this.processAutoPickChain(draftId))
      .catch((err) => {
        console.error(`[DraftService] autoPickChain failed for draft ${draftId}:`, err);
        return [] as DraftPick[];
      });
    this.autoPickChainLocks.set(draftId, run);
    run.finally(() => {
      if (this.autoPickChainLocks.get(draftId) === run) {
        this.autoPickChainLocks.delete(draftId);
      }
    });
    return run;
  }

  // ---- Draft Queue Methods ----

  async getAvailablePlayers(
    draftId: string,
    userId: string,
    options: { position?: string; query?: string; limit?: number; offset?: number },
  ): Promise<Player[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return this.draftRepository.findAvailablePlayers(draftId, {
      position: options.position,
      query: options.query,
      limit: Math.min(options.limit ?? 50, 200),
      offset: options.offset ?? 0,
    });
  }

  async getQueue(draftId: string, userId: string): Promise<any[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return this.draftRepository.getQueue(draftId, userId);
  }

  async setQueue(draftId: string, userId: string, playerIds: string[]): Promise<any[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status === 'complete') throw new ValidationException('Draft is already complete');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    await this.draftRepository.setQueue(draftId, userId, playerIds);
    return this.draftRepository.getQueue(draftId, userId);
  }

  async addToQueue(
    draftId: string,
    userId: string,
    playerId: string,
    maxBid?: number | null,
  ): Promise<any[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status === 'complete') throw new ValidationException('Draft is already complete');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    await this.draftRepository.addToQueue(draftId, userId, playerId, maxBid);
    return this.draftRepository.getQueue(draftId, userId);
  }

  async updateQueueMaxBid(
    draftId: string,
    userId: string,
    playerId: string,
    maxBid: number | null,
  ): Promise<any[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status === 'complete') throw new ValidationException('Draft is already complete');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    await this.draftRepository.updateQueueItemMaxBid(draftId, userId, playerId, maxBid);
    return this.draftRepository.getQueue(draftId, userId);
  }

  async removeFromQueue(draftId: string, userId: string, playerId: string): Promise<any[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status === 'complete') throw new ValidationException('Draft is already complete');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    await this.draftRepository.removeFromQueue(draftId, userId, playerId);
    return this.draftRepository.getQueue(draftId, userId);
  }
}
