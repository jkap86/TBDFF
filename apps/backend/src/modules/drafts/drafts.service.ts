import { DraftRepository } from './drafts.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { PlayerRepository } from '../players/players.repository';
import { Draft, DraftPick, DraftMetadata, AuctionNomination, DEFAULT_DRAFT_SETTINGS, DraftType } from './drafts.model';
import { Player } from '../players/players.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../../shared/exceptions';

export class DraftService {
  /** Per-draft lock to prevent concurrent processAutoBids executions */
  private autoBidLocks = new Map<string, Promise<Draft | null>>();

  constructor(
    private readonly draftRepository: DraftRepository,
    private readonly leagueRepository: LeagueRepository,
    private readonly playerRepository: PlayerRepository,
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
      throw new ValidationException(
        `Draft order must have exactly ${league.totalRosters} slots`
      );
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
        `Slot to roster mapping must have exactly ${league.totalRosters} entries`
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

    // Generate all pick slots
    await this.draftRepository.createPicks(
      draftId,
      draft.settings.rounds,
      draft.settings.teams,
      draft.type,
      draft.draftOrder,
      draft.slotToRosterId,
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
          Date.now() + (draft.settings.offering_timer || draft.settings.nomination_timer) * 1000
        ).toISOString(),
      };
    }

    // Update draft status
    const updated = await this.draftRepository.update(draftId, {
      status: 'drafting',
      startTime: new Date().toISOString(),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
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

    if (!pick) throw new ConflictException('Pick was already made');

    // Update last_picked timestamp
    await this.draftRepository.update(draftId, {
      lastPicked: new Date().toISOString(),
    });

    // Atomically complete draft if all picks are made
    const completed = await this.draftRepository.completeIfAllPicked(draftId);
    if (completed) {
      await this.draftRepository.updateLeagueStatus(draft.leagueId, 'in_season');
    }

    // Process auto-pick chain for subsequent autopick users
    const chainedPicks = completed ? [] : await this.processAutoPickChain(draftId);

    return { pick, chainedPicks };
  }

  async autoPick(draftId: string, userId: string): Promise<{ pick: DraftPick; chainedPicks: DraftPick[] }> {
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

    // Determine the user who owns the current slot
    const slotOwner = this.findUserBySlot(draft.draftOrder, nextPick.draftSlot) ?? userId;

    // Try the user's queue first, fall back to best available
    const queuedPlayer = await this.draftRepository.findFirstAvailableFromQueue(draftId, slotOwner);
    const bestPlayer = queuedPlayer ?? await this.draftRepository.findBestAvailable(draftId);
    if (!bestPlayer) {
      throw new ValidationException('No available players to auto-pick');
    }

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
      slotOwner,
      pickMetadata,
    );

    if (!pick) throw new ConflictException('Pick was already made');

    // Update last_picked timestamp
    await this.draftRepository.update(draftId, {
      lastPicked: new Date().toISOString(),
    });

    // Timeout triggers autopick mode for the timed-out user
    await this.draftRepository.addAutoPickUser(draftId, slotOwner);

    // Atomically complete draft if all picks are made
    const completed = await this.draftRepository.completeIfAllPicked(draftId);
    if (completed) {
      await this.draftRepository.updateLeagueStatus(draft.leagueId, 'in_season');
    }

    // Process auto-pick chain for subsequent autopick users
    const chainedPicks = completed ? [] : await this.processAutoPickChain(draftId);

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
      const updatedDraft = await this.draftRepository.removeAutoPickUser(draftId, userId) ?? draft;
      return { draft: updatedDraft, picks: [] };
    }

    // Toggle ON
    await this.draftRepository.addAutoPickUser(draftId, userId);

    // If it's currently this user's turn, chain auto-picks starting now
    const chainedPicks = await this.processAutoPickChain(draftId);

    const finalDraft = await this.draftRepository.findById(draftId);
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
      const slotOwner = this.findUserBySlot(draft.draftOrder, nextPick.draftSlot);
      if (!slotOwner || !autoPickUsers.includes(slotOwner)) break;

      const queuedPlayer = await this.draftRepository.findFirstAvailableFromQueue(draftId, slotOwner);
      const bestPlayer = queuedPlayer ?? await this.draftRepository.findBestAvailable(draftId);
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
        slotOwner,
        pickMetadata,
      );

      if (!pick) break;

      await this.draftRepository.update(draftId, {
        lastPicked: new Date().toISOString(),
      });

      chainedPicks.push(pick);

      const completed = await this.draftRepository.completeIfAllPicked(draftId);
      if (completed) {
        await this.draftRepository.updateLeagueStatus(draft.leagueId, 'in_season');
        break;
      }
    }

    return chainedPicks;
  }

  // ---- Draft Queue Methods ----

  async getAvailablePlayers(
    draftId: string,
    userId: string,
    options: { position?: string; query?: string; limit?: number; offset?: number }
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

  async addToQueue(draftId: string, userId: string, playerId: string, maxBid?: number | null): Promise<any[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status === 'complete') throw new ValidationException('Draft is already complete');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    await this.draftRepository.addToQueue(draftId, userId, playerId, maxBid);
    return this.draftRepository.getQueue(draftId, userId);
  }

  async updateQueueMaxBid(draftId: string, userId: string, playerId: string, maxBid: number | null): Promise<any[]> {
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

  // ---- Auction Draft Methods ----

  async nominate(
    draftId: string,
    userId: string,
    playerId: string,
    amount: number,
  ): Promise<Draft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status !== 'drafting') throw new ValidationException('Draft is not active');
    if (draft.type !== 'auction') throw new ValidationException('Not an auction draft');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('Not a member of this league');

    if (draft.metadata?.current_nomination) {
      throw new ConflictException('A nomination is already active');
    }

    const nextPick = await this.draftRepository.findNextPick(draftId);
    if (!nextPick) throw new ValidationException('All nominations complete');

    const userSlot = draft.draftOrder[userId];
    if (userSlot === undefined) throw new ForbiddenException('No draft slot assigned');

    const isCommissioner = member.role === 'commissioner';
    if (!isCommissioner && nextPick.draftSlot !== userSlot) {
      throw new ForbiddenException('It is not your turn to nominate');
    }

    if (amount < 1) throw new ValidationException('Minimum bid is $1');

    const alreadyPicked = await this.draftRepository.isPlayerPicked(draftId, playerId);
    if (alreadyPicked) throw new ConflictException('Player already drafted');

    const nominatorRosterId = this.findRosterIdByUserId(draft, userId);
    if (nominatorRosterId === null) throw new ForbiddenException('No roster found');

    await this.validateBudget(draft, nominatorRosterId, amount);

    const player = await this.playerRepository.findById(playerId);
    if (!player) throw new ValidationException('Player not found');

    const playerMeta = {
      first_name: player.firstName,
      last_name: player.lastName,
      full_name: player.fullName,
      position: player.position,
      team: player.team,
      auction_value: player.auctionValue ?? null,
    };

    const bidDeadline = new Date(
      Date.now() + draft.settings.nomination_timer * 1000
    ).toISOString();

    const nomination: AuctionNomination = {
      pick_id: nextPick.id,
      player_id: playerId,
      nominated_by: userId,
      current_bid: amount,
      current_bidder: userId,
      bidder_roster_id: nominatorRosterId,
      bid_deadline: bidDeadline,
      bid_history: [{ user_id: userId, amount, timestamp: new Date().toISOString() }],
      player_metadata: playerMeta,
    };

    const updated = await this.draftRepository.update(draftId, {
      metadata: {
        ...draft.metadata,
        current_nomination: nomination,
        nomination_deadline: null,
      },
      lastPicked: new Date().toISOString(),
    });

    if (!updated) throw new NotFoundException('Draft not found');

    this.scheduleAutoBids(draftId);
    return updated;
  }

  async placeBid(
    draftId: string,
    userId: string,
    amount: number,
  ): Promise<{ draft: Draft; won?: DraftPick }> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status !== 'drafting') throw new ValidationException('Draft is not active');
    if (draft.type !== 'auction') throw new ValidationException('Not an auction draft');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('Not a member');

    const nomination = draft.metadata?.current_nomination;
    if (!nomination) throw new ValidationException('No active nomination');

    const deadline = new Date(nomination.bid_deadline).getTime();
    if (Date.now() > deadline) {
      return this.resolveNomination(draftId, userId);
    }

    if (amount <= nomination.current_bid) {
      throw new ValidationException(`Bid must be greater than $${nomination.current_bid}`);
    }

    if (userId === nomination.current_bidder) {
      throw new ValidationException('You already have the highest bid');
    }

    const bidderRosterId = this.findRosterIdByUserId(draft, userId);
    if (bidderRosterId === null) throw new ForbiddenException('No roster found');

    await this.validateBudget(draft, bidderRosterId, amount);

    const newDeadline = new Date(
      Date.now() + draft.settings.nomination_timer * 1000
    ).toISOString();

    const updatedNomination = {
      ...nomination,
      current_bid: amount,
      current_bidder: userId,
      bidder_roster_id: bidderRosterId,
      bid_deadline: newDeadline,
      bid_history: [
        ...nomination.bid_history,
        { user_id: userId, amount, timestamp: new Date().toISOString() },
      ],
    };

    const updated = await this.draftRepository.update(draftId, {
      metadata: {
        ...draft.metadata,
        current_nomination: updatedNomination,
      },
      lastPicked: new Date().toISOString(),
    });

    if (!updated) throw new NotFoundException('Draft not found');

    this.scheduleAutoBids(draftId);
    return { draft: updated };
  }

  async resolveNomination(draftId: string, userId: string): Promise<{ draft: Draft; won?: DraftPick }> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('Not a member of this league');

    let nomination = draft.metadata?.current_nomination;
    if (!nomination) throw new ValidationException('No active nomination');

    // Guard: do not resolve if the bid deadline has not expired yet
    if (nomination.bid_deadline) {
      const deadline = new Date(nomination.bid_deadline).getTime();
      if (Date.now() < deadline) {
        throw new ValidationException('Bid deadline has not expired yet');
      }
    }

    // Defensive: if winner's roster is full, find an eligible fallback team
    const winnerPicksWon = await this.draftRepository.countPicksWonByRoster(
      draftId,
      nomination.bidder_roster_id,
    );
    if (winnerPicksWon >= this.getMaxPlayersPerTeam(draft)) {
      const fallback = await this.findEligibleInitialBidder(draft, null);
      if (fallback) {
        nomination = {
          ...nomination,
          current_bidder: fallback.userId,
          bidder_roster_id: fallback.rosterId,
        };
      }
    }

    const pickMetadata = {
      ...nomination.player_metadata,
      bid_history: nomination.bid_history,
      nominated_by: nomination.nominated_by,
    };

    const pick = await this.draftRepository.makeAuctionPick(
      nomination.pick_id,
      nomination.player_id,
      nomination.current_bidder,
      nomination.bidder_roster_id,
      nomination.current_bid,
      pickMetadata,
    );

    if (!pick) throw new ConflictException('Pick already resolved');

    await this.draftRepository.deductBudget(
      draftId,
      nomination.bidder_roster_id,
      nomination.current_bid,
    );

    const completed = await this.draftRepository.completeIfAllPicked(draftId);
    if (completed) {
      await this.draftRepository.updateLeagueStatus(draft.leagueId, 'in_season');
      const refreshedDraft = await this.draftRepository.findById(draftId);
      // Clear nomination state on completion
      await this.draftRepository.update(draftId, {
        metadata: {
          ...refreshedDraft!.metadata,
          current_nomination: null,
          nomination_deadline: null,
        },
      });
      const finalDraft = await this.draftRepository.findById(draftId);
      return { draft: finalDraft!, won: pick };
    }

    // Set up next nomination
    const refreshedDraft = await this.draftRepository.findById(draftId);
    const nominationDeadline = new Date(
      Date.now() + (draft.settings.offering_timer || draft.settings.nomination_timer) * 1000
    ).toISOString();

    await this.draftRepository.update(draftId, {
      metadata: {
        ...refreshedDraft!.metadata,
        current_nomination: null,
        nomination_deadline: nominationDeadline,
      },
      lastPicked: new Date().toISOString(),
    });

    // Check if next nominator is on auto-pick
    await this.processAutoNomination(draftId);

    const finalDraft = await this.draftRepository.findById(draftId);
    return { draft: finalDraft!, won: pick };
  }

  async autoNominate(draftId: string, userId: string): Promise<Draft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.type !== 'auction') throw new ValidationException('Not an auction draft');
    if (draft.status !== 'drafting') throw new ValidationException('Draft is not active');

    if (draft.metadata?.current_nomination) {
      throw new ValidationException('A nomination is already active');
    }

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    const isCommissioner = member?.role === 'commissioner';

    if (!isCommissioner) {
      const deadline = draft.metadata?.nomination_deadline;
      if (deadline && Date.now() < new Date(deadline).getTime()) {
        throw new ValidationException('Nomination timer has not expired');
      }
    }

    const nextPick = await this.draftRepository.findNextPick(draftId);
    if (!nextPick) throw new ValidationException('All nominations complete');

    // Enable auto-pick for the timed-out nominator
    const slotOwner = this.findUserBySlot(draft.draftOrder, nextPick.draftSlot);
    if (slotOwner) {
      await this.draftRepository.addAutoPickUser(draftId, slotOwner);
    }

    // Try the user's queue first, fall back to best available
    const queuedPlayer = slotOwner
      ? await this.draftRepository.findFirstAvailableFromQueue(draftId, slotOwner)
      : null;
    const bestPlayer = queuedPlayer ?? await this.draftRepository.findBestAvailable(draftId);
    if (!bestPlayer) throw new ValidationException('No available players');

    const nominatorRosterId = draft.slotToRosterId[String(nextPick.draftSlot)];
    const bidDeadline = new Date(
      Date.now() + draft.settings.nomination_timer * 1000
    ).toISOString();

    // If nominator's roster is full, find an eligible team for the initial bid
    let initialBidderId = slotOwner || userId;
    let initialBidderRosterId = nominatorRosterId;
    const nominatorPicksWon = await this.draftRepository.countPicksWonByRoster(draftId, nominatorRosterId);
    if (nominatorPicksWon >= this.getMaxPlayersPerTeam(draft)) {
      const eligible = await this.findEligibleInitialBidder(draft, null);
      if (eligible) {
        initialBidderId = eligible.userId;
        initialBidderRosterId = eligible.rosterId;
      }
    }

    const nomination: AuctionNomination = {
      pick_id: nextPick.id,
      player_id: bestPlayer.id,
      nominated_by: slotOwner || userId,
      current_bid: 1,
      current_bidder: initialBidderId,
      bidder_roster_id: initialBidderRosterId,
      bid_deadline: bidDeadline,
      bid_history: [{
        user_id: initialBidderId,
        amount: 1,
        timestamp: new Date().toISOString(),
      }],
      player_metadata: {
        first_name: bestPlayer.firstName,
        last_name: bestPlayer.lastName,
        full_name: bestPlayer.fullName,
        position: bestPlayer.position,
        team: bestPlayer.team,
        auction_value: bestPlayer.auctionValue ?? null,
      },
    };

    const refreshedDraft = await this.draftRepository.findById(draftId);
    const updated = await this.draftRepository.update(draftId, {
      metadata: {
        ...refreshedDraft!.metadata,
        current_nomination: nomination,
        nomination_deadline: null,
      },
      lastPicked: new Date().toISOString(),
    });

    this.scheduleAutoBids(draftId);
    return updated!;
  }

  private async processAutoNomination(draftId: string): Promise<void> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft || draft.status !== 'drafting' || draft.type !== 'auction') return;
    if (draft.metadata?.current_nomination) return;

    const nextPick = await this.draftRepository.findNextPick(draftId);
    if (!nextPick) return;

    const autoPickUsers: string[] = draft.metadata?.auto_pick_users ?? [];
    const slotOwner = this.findUserBySlot(draft.draftOrder, nextPick.draftSlot);

    if (slotOwner && autoPickUsers.includes(slotOwner)) {
      const queuedPlayer = await this.draftRepository.findFirstAvailableFromQueue(draftId, slotOwner);
      const bestPlayer = queuedPlayer ?? await this.draftRepository.findBestAvailable(draftId);
      if (!bestPlayer) return;

      const nominatorRosterId = draft.slotToRosterId[String(nextPick.draftSlot)];
      const bidDeadline = new Date(
        Date.now() + draft.settings.nomination_timer * 1000
      ).toISOString();

      // If nominator's roster is full, find an eligible team for the initial bid
      let initialBidderId = slotOwner;
      let initialBidderRosterId = nominatorRosterId;
      const nominatorPicksWon = await this.draftRepository.countPicksWonByRoster(draftId, nominatorRosterId);
      if (nominatorPicksWon >= this.getMaxPlayersPerTeam(draft)) {
        const eligible = await this.findEligibleInitialBidder(draft, null);
        if (eligible) {
          initialBidderId = eligible.userId;
          initialBidderRosterId = eligible.rosterId;
        }
      }

      const nomination: AuctionNomination = {
        pick_id: nextPick.id,
        player_id: bestPlayer.id,
        nominated_by: slotOwner,
        current_bid: 1,
        current_bidder: initialBidderId,
        bidder_roster_id: initialBidderRosterId,
        bid_deadline: bidDeadline,
        bid_history: [{ user_id: initialBidderId, amount: 1, timestamp: new Date().toISOString() }],
        player_metadata: {
          first_name: bestPlayer.firstName,
          last_name: bestPlayer.lastName,
          full_name: bestPlayer.fullName,
          position: bestPlayer.position,
          team: bestPlayer.team,
          auction_value: bestPlayer.auctionValue ?? null,
        },
      };

      await this.draftRepository.update(draftId, {
        metadata: {
          ...draft.metadata,
          current_nomination: nomination,
          nomination_deadline: null,
        },
        lastPicked: new Date().toISOString(),
      });

      this.scheduleAutoBids(draftId);
    }
  }

  private async validateBudget(
    draft: Draft,
    rosterId: number,
    bidAmount: number,
  ): Promise<void> {
    const budgets: Record<string, number> = draft.metadata?.auction_budgets ?? {};
    const currentBudget = budgets[String(rosterId)] ?? 0;

    const picksWon = await this.draftRepository.countPicksWonByRoster(draft.id, rosterId);
    const totalSlots = this.getMaxPlayersPerTeam(draft);
    const remainingSlots = totalSlots - picksWon;

    if (remainingSlots <= 0) {
      throw new ValidationException('Your roster is full');
    }

    // Must keep $1 per remaining unfilled slot (excluding the one being bid on)
    const reserveNeeded = Math.max(0, (remainingSlots - 1));
    const maxBid = currentBudget - reserveNeeded;

    if (bidAmount > maxBid) {
      throw new ValidationException(
        `Bid exceeds budget. Max bid: $${maxBid} (budget: $${currentBudget}, must reserve $${reserveNeeded})`
      );
    }
  }

  private findRosterIdByUserId(draft: Draft, userId: string): number | null {
    const userSlot = draft.draftOrder[userId];
    if (userSlot === undefined) return null;
    return draft.slotToRosterId[String(userSlot)] ?? null;
  }

  private findUserBySlot(draftOrder: Record<string, number>, slot: number): string | null {
    for (const [userId, userSlot] of Object.entries(draftOrder)) {
      if (userSlot === slot) return userId;
    }
    return null;
  }

  private getMaxPlayersPerTeam(draft: Draft): number {
    return draft.settings.max_players_per_team || draft.settings.rounds;
  }

  /**
   * Find the first team with remaining roster slots and enough budget
   * to place a minimum $1 bid. Used when the nominator's roster is full.
   */
  private async findEligibleInitialBidder(
    draft: Draft,
    excludeUserId: string | null,
  ): Promise<{ userId: string; rosterId: number } | null> {
    const budgets: Record<string, number> = draft.metadata?.auction_budgets ?? {};
    const allRosterIds = Object.values(draft.slotToRosterId);
    const picksWonMap = await this.draftRepository.countPicksWonByRosters(draft.id, allRosterIds);
    const maxPlayers = this.getMaxPlayersPerTeam(draft);

    for (const [slotStr, rosterId] of Object.entries(draft.slotToRosterId)) {
      const userId = this.findUserBySlot(draft.draftOrder, Number(slotStr));
      if (!userId || userId === excludeUserId) continue;

      const picksWon = picksWonMap.get(rosterId) ?? 0;
      if (picksWon >= maxPlayers) continue;

      const budget = budgets[String(rosterId)] ?? 0;
      const remainingSlots = maxPlayers - picksWon;
      const reserveNeeded = Math.max(0, remainingSlots - 1);
      if (budget - reserveNeeded >= 1) {
        return { userId, rosterId };
      }
    }
    return null;
  }

  /**
   * Schedule auto-bid processing with per-draft locking.
   * If a processAutoBids is already running for this draft, the new call
   * waits for it to finish then runs once more (coalescing multiple triggers).
   */
  private scheduleAutoBids(draftId: string): void {
    setTimeout(() => {
      const existing = this.autoBidLocks.get(draftId);
      const run = (existing ?? Promise.resolve(null))
        .then(() => this._processAutoBids(draftId))
        .catch((err) => {
          console.error(`[DraftService] processAutoBids failed for draft ${draftId}:`, err);
          return null;
        });
      this.autoBidLocks.set(draftId, run);
      run.finally(() => {
        if (this.autoBidLocks.get(draftId) === run) {
          this.autoBidLocks.delete(draftId);
        }
      });
    }, 3000);
  }

  /**
   * Process auto-bids after a nomination or manual bid.
   * Resolves multiple auto-bidders efficiently in one pass (second-price style).
   */
  private async _processAutoBids(draftId: string): Promise<Draft | null> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft || draft.status !== 'drafting' || draft.type !== 'auction') return null;

    const nomination = draft.metadata?.current_nomination;
    if (!nomination) return null;

    const autoPickUsers: string[] = draft.metadata?.auto_pick_users ?? [];
    if (autoPickUsers.length === 0) return null;

    const player = await this.playerRepository.findById(nomination.player_id);
    if (!player) return null;

    // Use stored auction value, or compute on-the-fly from search_rank (same VBD formula as computeAuctionValues)
    const auctionValue = player.auctionValue
      ?? (player.searchRank !== null
        ? Math.max(1, Math.round(55 * Math.exp(-0.022 * player.searchRank) + 0.5))
        : null);
    if (auctionValue === null) return null;

    const draftBudget = draft.settings.budget;
    const currentBid: number = nomination.current_bid;
    const currentBidder: string = nomination.current_bidder;

    // Build list of ALL auto-bidders and their targets (including current bidder)
    // Batch-fetch queue items and roster pick counts to avoid N+2 queries per bidder
    const userRosterPairs: Array<{ userId: string; rosterId: number }> = [];
    for (const userId of autoPickUsers) {
      const rosterId = this.findRosterIdByUserId(draft, userId);
      if (rosterId !== null) userRosterPairs.push({ userId, rosterId });
    }

    if (userRosterPairs.length === 0) return null;

    const [queueItemsMap, picksWonMap] = await Promise.all([
      this.draftRepository.getQueueItemsForPlayerByUsers(
        draftId,
        userRosterPairs.map((p) => p.userId),
        nomination.player_id,
      ),
      this.draftRepository.countPicksWonByRosters(
        draftId,
        userRosterPairs.map((p) => p.rosterId),
      ),
    ]);

    const allAutoTargets: Array<{ userId: string; rosterId: number; effectiveTarget: number }> = [];
    const budgets: Record<string, number> = draft.metadata?.auction_budgets ?? {};

    for (const { userId, rosterId } of userRosterPairs) {
      const queueItem = queueItemsMap.get(userId) ?? null;
      const target = queueItem?.max_bid != null
        ? queueItem.max_bid
        : Math.floor(auctionValue * 0.8 * (draftBudget / 200));

      const budget = budgets[String(rosterId)] ?? 0;
      const picksWon = picksWonMap.get(rosterId) ?? 0;
      const totalSlots = this.getMaxPlayersPerTeam(draft);
      const remainingSlots = totalSlots - picksWon;

      if (remainingSlots <= 0) continue;

      const reserveNeeded = Math.max(0, remainingSlots - 1);
      const maxAffordable = budget - reserveNeeded;

      const effectiveTarget = Math.min(target, maxAffordable);
      if (effectiveTarget > 0) {
        allAutoTargets.push({ userId, rosterId, effectiveTarget });
      }
    }

    if (allAutoTargets.length === 0) return null;

    // Filter to eligible bidders: not the current bidder and can beat the current bid
    const eligible = allAutoTargets.filter(
      (entry) => entry.userId !== currentBidder && entry.effectiveTarget > currentBid
    );

    if (eligible.length === 0) return null;

    // Round-robin: pick the eligible bidder with the fewest auto-bids so far,
    // so all auto-pick teams participate rather than just the top 2.
    const autoBidCounts: Record<string, number> = {};
    for (const bid of nomination.bid_history) {
      if (bid.auto_bid) {
        autoBidCounts[bid.user_id] = (autoBidCounts[bid.user_id] || 0) + 1;
      }
    }
    eligible.sort((a, b) => (autoBidCounts[a.userId] || 0) - (autoBidCounts[b.userId] || 0));

    const winner = eligible[0];
    const winningBid = currentBid + 1;

    const newDeadline = new Date(
      Date.now() + draft.settings.nomination_timer * 1000
    ).toISOString();

    const updatedNomination = {
      ...nomination,
      current_bid: winningBid,
      current_bidder: winner.userId,
      bidder_roster_id: winner.rosterId,
      bid_deadline: newDeadline,
      bid_history: [
        ...nomination.bid_history,
        {
          user_id: winner.userId,
          amount: winningBid,
          timestamp: new Date().toISOString(),
          auto_bid: true,
        },
      ],
    };

    const updated = await this.draftRepository.update(draftId, {
      metadata: {
        ...draft.metadata,
        current_nomination: updatedNomination,
      },
      lastPicked: new Date().toISOString(),
    });

    this.scheduleAutoBids(draftId);

    return updated;
  }
}
