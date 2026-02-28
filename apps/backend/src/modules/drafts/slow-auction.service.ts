import { Pool } from 'pg';
import { AuctionLotRepository } from './auction-lot.repository';
import { DraftRepository } from './drafts.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { PlayerRepository } from '../players/players.repository';
import { DraftGateway } from './draft.gateway';
import { AuctionLot, SlowAuctionSettings, RosterBudgetData } from './slow-auction.model';
import { Draft, DraftPick } from './drafts.model';
import { Player } from '../players/players.model';
import { resolveSecondPrice, computeExtendedDeadline, type ProxyBidSnapshot, type OutbidNotification } from './auction-price-resolver';
import { findRosterIdByUserId, findUserByRosterId, getMaxPlayersPerTeam } from './draft-helpers';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../../shared/exceptions';

export class SlowAuctionService {
  private draftGateway?: DraftGateway;

  constructor(
    private readonly lotRepo: AuctionLotRepository,
    private readonly draftRepo: DraftRepository,
    private readonly leagueRepo: LeagueRepository,
    private readonly playerRepo: PlayerRepository,
    private readonly pool: Pool,
  ) {}

  setGateway(gateway: DraftGateway): void {
    this.draftGateway = gateway;
  }

  // ---- Player Metadata Helper ----

  private buildPlayerMeta(player: Player | null | undefined): Record<string, unknown> | undefined {
    if (!player) return undefined;
    return {
      full_name: player.fullName,
      first_name: player.firstName,
      last_name: player.lastName,
      position: player.position,
      team: player.team,
      auction_value: player.auctionValue ?? null,
    };
  }

  // ---- Settings Helper ----

  private getSettings(draft: Draft): SlowAuctionSettings {
    const s = draft.settings;
    return {
      bidWindowSeconds: s.bid_window_seconds || 43200,
      maxNominationsPerTeam: s.max_nominations_per_team || 2,
      maxNominationsGlobal: s.max_nominations_global || 25,
      dailyNominationLimit: s.daily_nomination_limit || 0,
      minBid: s.min_bid || 1,
      minIncrement: s.min_increment || 1,
      budget: s.budget || 200,
      maxPlayersPerTeam: getMaxPlayersPerTeam(draft),
      maxLotDurationSeconds: s.max_lot_duration_seconds || null,
    };
  }

  /** Get Eastern date string (YYYY-MM-DD) for daily nomination tracking */
  private getEasternDateString(): string {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ---- Nominate ----

  async nominate(
    draftId: string,
    userId: string,
    playerId: string,
  ): Promise<{ lot: AuctionLot; draft: Draft; playerMetadata?: Record<string, unknown> }> {
    const draft = await this.draftRepo.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status !== 'drafting') throw new ValidationException('Draft is not active');
    if (draft.type !== 'slow_auction') throw new ValidationException('Not a slow auction draft');

    const member = await this.leagueRepo.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('Not a member of this league');

    const rosterId = findRosterIdByUserId(draft, userId);
    if (rosterId === null) throw new ForbiddenException('No roster found');

    const settings = this.getSettings(draft);

    // Validate player exists
    const player = await this.playerRepo.findById(playerId);
    if (!player) throw new ValidationException('Player not found');

    // Already drafted via draft_picks?
    const alreadyPicked = await this.draftRepo.isPlayerPicked(draftId, playerId);
    if (alreadyPicked) throw new ConflictException('Player already drafted');

    // All nomination logic under advisory lock
    const lot = await this.lotRepo.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [draftId]);

      // Check player not already in an active/won lot
      const alreadyNominated = await this.lotRepo.isPlayerNominatedOrWon(draftId, playerId, client);
      if (alreadyNominated) throw new ConflictException('Player already nominated');

      // Budget check: can they afford at least minBid?
      const budgetData = await this.lotRepo.getRosterBudgetData(draftId, rosterId, client);
      const remainingSlots = settings.maxPlayersPerTeam - budgetData.wonCount;
      if (remainingSlots <= 0) throw new ValidationException('Your roster is full');
      const reserveNeeded = Math.max(0, remainingSlots - 1) * settings.minBid;
      const maxAffordable = settings.budget - budgetData.spent - reserveNeeded - budgetData.leadingCommitment;
      if (settings.minBid > maxAffordable) throw new ValidationException('Insufficient budget to nominate');

      // Per-team nomination limit
      const activeForRoster = await this.lotRepo.countActiveLotsForRoster(draftId, rosterId, client);
      if (activeForRoster >= settings.maxNominationsPerTeam) {
        throw new ValidationException(`Maximum ${settings.maxNominationsPerTeam} active nominations per team`);
      }

      // Global nomination limit
      const globalActive = await this.lotRepo.countAllActiveLots(draftId, client);
      if (globalActive >= settings.maxNominationsGlobal) {
        throw new ValidationException('Global nomination cap reached');
      }

      // Daily limit
      if (settings.dailyNominationLimit > 0) {
        const dateStr = this.getEasternDateString();
        const dailyCount = await this.lotRepo.countDailyNominationsForRoster(draftId, rosterId, dateStr, client);
        if (dailyCount >= settings.dailyNominationLimit) {
          throw new ValidationException('Daily nomination limit reached');
        }
      }

      // Create the lot
      const bidDeadline = new Date(Date.now() + settings.bidWindowSeconds * 1000);
      return this.lotRepo.createLot({
        draftId,
        playerId,
        nominatorRosterId: rosterId,
        currentBid: settings.minBid,
        bidDeadline,
        nominationDate: this.getEasternDateString(),
      }, client);
    });

    // Broadcast
    this.draftGateway?.broadcastSlowAuction(draftId, 'slow_auction:lot_created', {
      lot: lot.toSafeObject(undefined, this.buildPlayerMeta(player)),
    });

    return { lot, draft, playerMetadata: this.buildPlayerMeta(player) };
  }

  // ---- Set Max Bid ----

  async setMaxBid(
    draftId: string,
    lotId: string,
    userId: string,
    maxBid: number,
  ): Promise<{ lot: AuctionLot; outbidNotifications: OutbidNotification[] }> {
    const draft = await this.draftRepo.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status !== 'drafting') throw new ValidationException('Draft is not active');
    if (draft.type !== 'slow_auction') throw new ValidationException('Not a slow auction draft');

    const member = await this.leagueRepo.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('Not a member');

    const rosterId = findRosterIdByUserId(draft, userId);
    if (rosterId === null) throw new ForbiddenException('No roster found');

    const settings = this.getSettings(draft);

    if (maxBid < settings.minBid) {
      throw new ValidationException(`Minimum bid is $${settings.minBid}`);
    }

    const result = await this.lotRepo.withTransaction(async (client) => {
      // Roster-level advisory lock: serializes all bids from the same roster
      // Prevents concurrent bids on different lots from overcommitting budget
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${draftId}:roster:${rosterId}`]);

      // Lock the lot
      const lot = await this.lotRepo.findLotByIdForUpdate(lotId, client);
      if (!lot) throw new NotFoundException('Lot not found');
      if (lot.draftId !== draftId) throw new ValidationException('Lot does not belong to this draft');
      if (lot.status !== 'active') throw new ValidationException('Lot is not active');

      // Check deadline
      if (lot.bidDeadline && new Date(lot.bidDeadline).getTime() < Date.now()) {
        throw new ValidationException('Bid deadline has expired');
      }

      // Budget validation
      const budgetData = await this.lotRepo.getRosterBudgetData(draftId, rosterId, client);
      const remainingSlots = settings.maxPlayersPerTeam - budgetData.wonCount;
      if (remainingSlots <= 0) throw new ValidationException('Your roster is full');

      const reserveNeeded = Math.max(0, remainingSlots - 1) * settings.minBid;
      let maxAffordable = settings.budget - budgetData.spent - reserveNeeded - budgetData.leadingCommitment;

      // If we're already leading this lot, our current commitment is reusable
      if (lot.currentBidderRosterId === rosterId) {
        maxAffordable += lot.currentBid;

        // Prevent lowering max bid below the current visible price — this would
        // cause a leader change where the new leader's budget is not validated here
        if (maxBid < lot.currentBid) {
          throw new ValidationException(`Cannot lower bid below current price of $${lot.currentBid}`);
        }
      }

      if (maxBid > maxAffordable) {
        throw new ValidationException(`Bid exceeds budget. Max affordable: $${maxAffordable}`);
      }

      // Upsert proxy bid
      await this.lotRepo.upsertProxyBid(lotId, rosterId, maxBid, client);

      // Record bid history
      await this.lotRepo.recordBidHistory(lotId, rosterId, maxBid, false, client);

      // Resolve price with all proxy bids
      const allProxyBids = await this.lotRepo.getAllProxyBidsForLot(lotId, client);
      const proxyBids: ProxyBidSnapshot[] = allProxyBids.map((pb) => ({
        rosterId: pb.rosterId,
        maxBid: pb.maxBid,
      }));

      const resolution = resolveSecondPrice({
        lotId: lot.id,
        currentBid: lot.currentBid,
        currentBidderRosterId: lot.currentBidderRosterId,
        proxyBids,
        minBid: settings.minBid,
        minIncrement: settings.minIncrement,
      }, lot.bidCount);

      if (!resolution) {
        return { lot, outbidNotifications: [] };
      }

      // Compute deadline extension only on leader change
      let newDeadline: Date | undefined;
      if (resolution.leaderChanged) {
        const ext = computeExtendedDeadline(
          new Date(),
          new Date(lot.bidDeadline),
          new Date(lot.createdAt),
          settings.bidWindowSeconds,
          settings.maxLotDurationSeconds,
        );
        if (ext.shouldExtend) {
          newDeadline = ext.newDeadline;
        }
      }

      // CAS update
      const updatedLot = await this.lotRepo.updateLotWithCAS(
        lotId,
        {
          currentBid: resolution.newPrice,
          currentBidderRosterId: resolution.newLeader,
          bidCount: resolution.newBidCount,
          bidDeadline: newDeadline,
        },
        {
          currentBid: lot.currentBid,
          currentBidderRosterId: lot.currentBidderRosterId,
        },
        client,
      );

      if (!updatedLot) {
        // CAS failed — retry by re-reading. For simplicity, throw and let caller retry.
        throw new ConflictException('Concurrent bid detected, please retry');
      }

      // Record proxy bid resolution in history
      if (resolution.priceChanged) {
        await this.lotRepo.recordBidHistory(lotId, resolution.newLeader, resolution.newPrice, true, client);
      }

      return { lot: updatedLot, outbidNotifications: resolution.outbidNotifications };
    });

    // Fetch player for metadata in broadcasts
    const player = await this.playerRepo.findById(result.lot.playerId);
    const playerMeta = this.buildPlayerMeta(player);

    // Broadcast lot update
    this.draftGateway?.broadcastSlowAuction(draftId, 'slow_auction:lot_updated', {
      lot: result.lot.toSafeObject(undefined, playerMeta),
    });

    // Send outbid notifications
    for (const notification of result.outbidNotifications) {
      const outbidUserId = findUserByRosterId(draft.draftOrder, draft.slotToRosterId, notification.rosterId);
      if (outbidUserId) {
        this.draftGateway?.broadcastToUser(outbidUserId, 'slow_auction:outbid', {
          lot_id: lotId,
          player_id: result.lot.playerId,
          player_name: player?.fullName ?? result.lot.playerId,
          new_bid: notification.newLeadingBid,
        });
      }
    }

    return result;
  }

  // ---- Settle Lot ----

  async settleLot(lotId: string): Promise<{ lot: AuctionLot; pick?: DraftPick }> {
    return this.lotRepo.withTransaction(async (client) => {
      const lot = await this.lotRepo.findLotByIdForUpdate(lotId, client);
      if (!lot || lot.status !== 'active') {
        return { lot: lot! };
      }

      const draft = await this.draftRepo.findById(lot.draftId, client);
      if (!draft) throw new NotFoundException('Draft not found for lot');
      if (draft.status !== 'drafting') return { lot };

      const settings = this.getSettings(draft);

      // Get all proxy bids sorted by max_bid DESC, created_at ASC
      const proxyBids = await this.lotRepo.getAllProxyBidsForLot(lotId, client);

      if (proxyBids.length === 0) {
        // No bids — pass
        const passedLot = await this.lotRepo.settleLotPassed(lotId, client);
        this.draftGateway?.broadcastSlowAuction(lot.draftId, 'slow_auction:lot_passed', {
          lot: passedLot!.toSafeObject(),
        });
        return { lot: passedLot! };
      }

      // Pre-fetch budget data for all bidders in one query
      const allBudgetData = await this.lotRepo.getAllRosterBudgetData(lot.draftId, client);

      // Try each bidder in order, excluding those who already failed
      const failedRosterIds = new Set<number>();
      for (const proxyBid of proxyBids) {
        // Calculate second-price excluding bidders who already failed affordability
        const remainingBids = proxyBids
          .filter((pb) => !failedRosterIds.has(pb.rosterId))
          .map((pb) => ({ rosterId: pb.rosterId, maxBid: pb.maxBid }));

        const resolution = resolveSecondPrice({
          lotId: lot.id,
          currentBid: lot.currentBid,
          currentBidderRosterId: lot.currentBidderRosterId,
          proxyBids: remainingBids,
          minBid: settings.minBid,
          minIncrement: settings.minIncrement,
        }, lot.bidCount);

        if (!resolution) continue;

        const price = resolution.newPrice;

        // Check if this bidder can afford it
        const budgetData = allBudgetData.get(proxyBid.rosterId) ?? {
          rosterId: proxyBid.rosterId, spent: 0, wonCount: 0, leadingCommitment: 0,
        };
        const remainingSlots = settings.maxPlayersPerTeam - budgetData.wonCount;
        if (remainingSlots <= 0) {
          failedRosterIds.add(proxyBid.rosterId);
          continue;
        }

        const reserveNeeded = Math.max(0, remainingSlots - 1) * settings.minBid;
        // Exclude this lot's leading commitment since we're settling it
        let adjustedLeadingCommitment = budgetData.leadingCommitment;
        if (lot.currentBidderRosterId === proxyBid.rosterId) {
          adjustedLeadingCommitment -= lot.currentBid;
        }
        const maxAffordable = settings.budget - budgetData.spent - reserveNeeded - adjustedLeadingCommitment;

        if (price > maxAffordable) {
          failedRosterIds.add(proxyBid.rosterId);
          continue;
        }

        // This bidder can afford — settle as won
        const wonLot = await this.lotRepo.settleLotWon(lotId, proxyBid.rosterId, price, client);
        if (!wonLot) continue;

        // Create draft_pick
        const player = await this.playerRepo.findById(lot.playerId);
        const pickedByUserId = findUserByRosterId(draft.draftOrder, draft.slotToRosterId, proxyBid.rosterId);

        // Find the next available pick slot, or create one
        const nextPick = await this.draftRepo.findNextPick(lot.draftId, client);
        let pick: DraftPick | null = null;

        if (nextPick) {
          pick = await this.draftRepo.makeAuctionPick(
            nextPick.id,
            lot.playerId,
            pickedByUserId || draft.createdBy,
            proxyBid.rosterId,
            price,
            {
              lot_id: lotId,
              full_name: player?.fullName,
              first_name: player?.firstName,
              last_name: player?.lastName,
              position: player?.position,
              team: player?.team,
              auction_value: player?.auctionValue ?? null,
            },
            client,
          );
        } else {
          // No pre-created pick slots — create one directly
          const pickCountResult = await client.query(
            `SELECT COUNT(*) as cnt FROM draft_picks WHERE draft_id = $1 AND player_id IS NOT NULL`,
            [lot.draftId],
          );
          const pickNo = parseInt(pickCountResult.rows[0].cnt, 10) + 1;
          const round = Math.ceil(pickNo / draft.settings.teams) || 1;

          const insertResult = await client.query(
            `INSERT INTO draft_picks (draft_id, player_id, picked_by, roster_id, round, pick_no, draft_slot, amount, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
              lot.draftId, lot.playerId, pickedByUserId || draft.createdBy,
              proxyBid.rosterId, round, pickNo, 1, price,
              JSON.stringify({
                lot_id: lotId,
                full_name: player?.fullName,
                first_name: player?.firstName,
                last_name: player?.lastName,
                position: player?.position,
                team: player?.team,
                auction_value: player?.auctionValue ?? null,
              }),
            ],
          );
          pick = DraftPick.fromDatabase(insertResult.rows[0]);
        }

        // Clean up proxy bids
        await this.lotRepo.deleteProxyBidsForLot(lotId, client);

        // Remove from draft queue (inside transaction for atomicity)
        if (pickedByUserId) {
          await this.draftRepo.removeFromQueue(lot.draftId, pickedByUserId, lot.playerId, client);
        }

        // Check if draft is complete (all rosters full)
        const isComplete = await this.checkDraftComplete(lot.draftId, draft, settings, client);
        if (isComplete) {
          await client.query(`UPDATE drafts SET status = 'complete' WHERE id = $1`, [lot.draftId]);
          await client.query(`UPDATE leagues SET status = 'in_season' WHERE id = $1`, [draft.leagueId]);
          // Move drafted players to rosters (only append players not already present)
          await client.query(
            `UPDATE rosters r
             SET players = r.players || array(
               SELECT p FROM unnest(sub.new_players) p
               WHERE p != ALL(COALESCE(r.players, '{}'))
             )
             FROM (
               SELECT dp.roster_id, array_agg(dp.player_id ORDER BY dp.pick_no) AS new_players
               FROM draft_picks dp
               WHERE dp.draft_id = $1 AND dp.player_id IS NOT NULL
               GROUP BY dp.roster_id
             ) sub
             WHERE r.league_id = $2 AND r.roster_id = sub.roster_id`,
            [lot.draftId, draft.leagueId],
          );
        }

        // Broadcast
        this.draftGateway?.broadcastSlowAuction(lot.draftId, 'slow_auction:lot_won', {
          lot: wonLot.toSafeObject(),
          winner_roster_id: proxyBid.rosterId,
          price,
        });

        if (isComplete) {
          const updatedDraft = await this.draftRepo.findById(lot.draftId, client);
          if (updatedDraft) {
            this.draftGateway?.broadcast(lot.draftId, 'draft:state_updated', {
              draft: updatedDraft,
            });
          }
        }

        return { lot: wonLot, pick: pick ?? undefined };
      }

      // No bidder could afford — pass
      const passedLot = await this.lotRepo.settleLotPassed(lotId, client);
      await this.lotRepo.deleteProxyBidsForLot(lotId, client);

      this.draftGateway?.broadcastSlowAuction(lot.draftId, 'slow_auction:lot_passed', {
        lot: passedLot!.toSafeObject(),
      });

      return { lot: passedLot! };
    });
  }

  // ---- Process Expired Lots (called by settlement job) ----

  async processExpiredLots(): Promise<AuctionLot[]> {
    const expiredLots = await this.lotRepo.findExpiredLots();
    const settled: AuctionLot[] = [];

    for (const lot of expiredLots) {
      try {
        const result = await this.settleLot(lot.id);
        settled.push(result.lot);
      } catch (err) {
        console.error(`[SlowAuctionService] Failed to settle lot ${lot.id}:`, err);
      }
    }

    return settled;
  }

  // ---- Query Methods ----

  async getActiveLots(draftId: string, rosterId?: number): Promise<Array<{ lot: AuctionLot; myMaxBid: number | null; playerMetadata?: Record<string, unknown> }>> {
    const lots = await this.lotRepo.findActiveLotsByDraft(draftId);

    // Batch-fetch player metadata for all lots
    const playerIds = lots.map((l) => l.playerId);
    const players = await this.playerRepo.findByIds(playerIds);
    const playerMap = new Map(players.map((p) => [p.id, p]));

    if (rosterId !== undefined) {
      const userBids = await this.lotRepo.getProxyBidsForRosterByDraft(draftId, rosterId);
      return lots.map((lot) => ({
        lot,
        myMaxBid: userBids.get(lot.id) ?? null,
        playerMetadata: this.buildPlayerMeta(playerMap.get(lot.playerId)),
      }));
    }

    return lots.map((lot) => ({ lot, myMaxBid: null, playerMetadata: this.buildPlayerMeta(playerMap.get(lot.playerId)) }));
  }

  async getAllBudgets(draftId: string): Promise<Array<{
    roster_id: number;
    username: string;
    total_budget: number;
    spent: number;
    leading_commitment: number;
    available: number;
    won_count: number;
    total_slots: number;
  }>> {
    const draft = await this.draftRepo.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    const settings = this.getSettings(draft);
    const budgetDataMap = await this.lotRepo.getAllRosterBudgetData(draftId);

    // Get all roster owners
    const members = await this.leagueRepo.findMembersByLeagueId(draft.leagueId);
    const rosterToUser: Record<number, string> = {};
    for (const [userId, slot] of Object.entries(draft.draftOrder)) {
      const rid = draft.slotToRosterId[String(slot)];
      const member = members.find((m) => m.userId === userId);
      rosterToUser[rid] = member?.displayName || member?.username || `Team ${rid}`;
    }

    const budgets = [];
    for (const [, rosterId] of Object.entries(draft.slotToRosterId)) {
      const data = budgetDataMap.get(rosterId) ?? { rosterId, spent: 0, wonCount: 0, leadingCommitment: 0 };
      const remainingSlots = settings.maxPlayersPerTeam - data.wonCount;
      const reserveNeeded = Math.max(0, remainingSlots - 1) * settings.minBid;
      const available = Math.max(0, settings.budget - data.spent - reserveNeeded - data.leadingCommitment);

      budgets.push({
        roster_id: rosterId,
        username: rosterToUser[rosterId] || `Team ${rosterId}`,
        total_budget: settings.budget,
        spent: data.spent,
        leading_commitment: data.leadingCommitment,
        available,
        won_count: data.wonCount,
        total_slots: settings.maxPlayersPerTeam,
      });
    }

    return budgets;
  }

  async getNominationStats(draftId: string, rosterId: number): Promise<{
    active_nominations: number;
    max_per_team: number;
    global_active: number;
    max_global: number;
    daily_used: number;
    daily_limit: number;
  }> {
    const draft = await this.draftRepo.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    const settings = this.getSettings(draft);
    const [activeForRoster, globalActive, dailyUsed] = await Promise.all([
      this.lotRepo.countActiveLotsForRoster(draftId, rosterId),
      this.lotRepo.countAllActiveLots(draftId),
      settings.dailyNominationLimit > 0
        ? this.lotRepo.countDailyNominationsForRoster(draftId, rosterId, this.getEasternDateString())
        : Promise.resolve(0),
    ]);

    return {
      active_nominations: activeForRoster,
      max_per_team: settings.maxNominationsPerTeam,
      global_active: globalActive,
      max_global: settings.maxNominationsGlobal,
      daily_used: dailyUsed,
      daily_limit: settings.dailyNominationLimit,
    };
  }

  async getBidHistory(lotId: string) {
    return this.lotRepo.getBidHistoryForLot(lotId);
  }

  // ---- Private Helpers ----

  private async checkDraftComplete(
    draftId: string,
    draft: Draft,
    settings: SlowAuctionSettings,
    client: import('pg').PoolClient,
  ): Promise<boolean> {
    // Don't complete if there are still active lots that could settle
    const activeLots = await this.lotRepo.countAllActiveLots(draftId, client);
    if (activeLots > 0) return false;

    // Check if every roster has filled all slots
    const rosterIds = Object.values(draft.slotToRosterId);
    const picksWonMap = await this.draftRepo.countPicksWonByRosters(draftId, rosterIds, client);

    for (const rosterId of rosterIds) {
      const won = picksWonMap.get(rosterId) ?? 0;
      if (won < settings.maxPlayersPerTeam) return false;
    }

    return true;
  }
}
