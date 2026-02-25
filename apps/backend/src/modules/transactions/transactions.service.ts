import { TransactionRepository } from './transactions.repository';
import { Transaction, WaiverClaim } from './transactions.model';
import { LeagueRepository } from '../leagues/leagues.repository';
import { TransactionsGateway } from './transactions.gateway';
import {
  NotFoundException,
  ForbiddenException,
  ValidationException,
} from '../../shared/exceptions';

export class TransactionService {
  private gateway: TransactionsGateway | null = null;

  constructor(
    private readonly txRepo: TransactionRepository,
    private readonly leagueRepo: LeagueRepository,
  ) {}

  setGateway(gw: TransactionsGateway): void {
    this.gateway = gw;
  }

  async addFreeAgent(
    leagueId: string,
    userId: string,
    playerId: string,
    dropPlayerId?: string,
  ): Promise<Transaction> {
    const member = await this.leagueRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const league = await this.leagueRepo.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    if (league.settings.disable_adds) throw new ValidationException('Adds are disabled for this league');

    const roster = await this.leagueRepo.findRosterByOwner(leagueId, userId);
    if (!roster) throw new ValidationException('You do not own a roster in this league');

    // Check if player is already rostered
    const allRosters = await this.leagueRepo.findRostersByLeagueId(leagueId);
    for (const r of allRosters) {
      if (r.players.includes(playerId)) {
        throw new ValidationException('This player is already on a roster');
      }
    }

    // Check if player is on waivers
    const onWaivers = await this.txRepo.isPlayerOnWaivers(leagueId, playerId);
    if (onWaivers) throw new ValidationException('This player is on waivers. You must place a waiver claim.');

    // Validate drop player if specified
    if (dropPlayerId && !roster.players.includes(dropPlayerId)) {
      throw new ValidationException('Drop player is not on your roster');
    }

    // Check roster limits (total roster size vs position slots)
    const maxRosterSize = league.rosterPositions.length;
    if (!dropPlayerId && roster.players.length >= maxRosterSize) {
      throw new ValidationException('Roster is full. You must drop a player.');
    }

    return this.txRepo.withTransaction(async (client) => {
      const adds: Record<string, number> = { [playerId]: roster.rosterId };
      const drops: Record<string, number> = {};
      const playerIds = [playerId];

      // Add player
      await this.txRepo.addPlayerToRoster(client, leagueId, userId, playerId);

      // Drop player if specified
      if (dropPlayerId) {
        await this.txRepo.removePlayerFromRoster(client, leagueId, userId, dropPlayerId);
        drops[dropPlayerId] = roster.rosterId;
        playerIds.push(dropPlayerId);

        // Put dropped player on waivers
        const clearDays = league.settings.waiver_clear_days ?? 2;
        await this.txRepo.createPlayerWaiver(client, leagueId, dropPlayerId, userId, clearDays);
      }

      const tx = await this.txRepo.createTransaction(client, {
        leagueId,
        type: 'free_agent',
        status: 'complete',
        rosterIds: [roster.rosterId],
        playerIds,
        adds,
        drops,
        createdBy: userId,
      });

      this.gateway?.broadcastToLeague(leagueId, 'transaction:new', { transaction: tx.toSafeObject() });
      this.gateway?.broadcastToLeague(leagueId, 'roster:updated', { league_id: leagueId });

      return tx;
    });
  }

  async dropPlayer(leagueId: string, userId: string, playerId: string): Promise<Transaction> {
    const member = await this.leagueRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const league = await this.leagueRepo.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const roster = await this.leagueRepo.findRosterByOwner(leagueId, userId);
    if (!roster) throw new ValidationException('You do not own a roster in this league');

    if (!roster.players.includes(playerId)) {
      throw new ValidationException('This player is not on your roster');
    }

    return this.txRepo.withTransaction(async (client) => {
      await this.txRepo.removePlayerFromRoster(client, leagueId, userId, playerId);

      // Put player on waivers
      const clearDays = league.settings.waiver_clear_days ?? 2;
      await this.txRepo.createPlayerWaiver(client, leagueId, playerId, userId, clearDays);

      const tx = await this.txRepo.createTransaction(client, {
        leagueId,
        type: 'free_agent',
        status: 'complete',
        rosterIds: [roster.rosterId],
        playerIds: [playerId],
        drops: { [playerId]: roster.rosterId },
        createdBy: userId,
      });

      this.gateway?.broadcastToLeague(leagueId, 'transaction:new', { transaction: tx.toSafeObject() });
      this.gateway?.broadcastToLeague(leagueId, 'roster:updated', { league_id: leagueId });

      return tx;
    });
  }

  async placeWaiverClaim(
    leagueId: string,
    userId: string,
    request: { player_id: string; drop_player_id?: string; faab_amount?: number },
  ): Promise<WaiverClaim> {
    const member = await this.leagueRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const league = await this.leagueRepo.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const roster = await this.leagueRepo.findRosterByOwner(leagueId, userId);
    if (!roster) throw new ValidationException('You do not own a roster in this league');

    // Check player is already rostered
    const allRosters = await this.leagueRepo.findRostersByLeagueId(leagueId);
    for (const r of allRosters) {
      if (r.players.includes(request.player_id)) {
        throw new ValidationException('This player is already on a roster');
      }
    }

    // Validate drop player
    if (request.drop_player_id && !roster.players.includes(request.drop_player_id)) {
      throw new ValidationException('Drop player is not on your roster');
    }

    // Check roster limits
    const maxRosterSize = league.rosterPositions.length;
    if (!request.drop_player_id && roster.players.length >= maxRosterSize) {
      throw new ValidationException('Roster is full. You must specify a player to drop.');
    }

    // FAAB validation
    if (request.faab_amount !== undefined) {
      if (request.faab_amount < (league.settings.waiver_bid_min ?? 0)) {
        throw new ValidationException(`Minimum FAAB bid is $${league.settings.waiver_bid_min ?? 0}`);
      }
    }

    // Calculate process_at based on waiver settings
    const processAt = this.calculateWaiverProcessTime(league.settings);

    const claim = await this.txRepo.createWaiverClaim({
      leagueId,
      rosterId: roster.rosterId,
      userId,
      playerId: request.player_id,
      dropPlayerId: request.drop_player_id,
      faabAmount: request.faab_amount,
      priority: roster.settings.waiver_position ?? 0,
      processAt,
    });

    return claim;
  }

  async updateWaiverClaim(
    leagueId: string,
    claimId: string,
    userId: string,
    updates: { drop_player_id?: string | null; faab_amount?: number },
  ): Promise<WaiverClaim> {
    const claim = await this.txRepo.findWaiverClaimById(claimId);
    if (!claim) throw new NotFoundException('Waiver claim not found');
    if (claim.userId !== userId) throw new ForbiddenException('You can only modify your own claims');
    if (claim.leagueId !== leagueId) throw new NotFoundException('Waiver claim not found');

    const updated = await this.txRepo.updateClaim(claimId, {
      dropPlayerId: updates.drop_player_id,
      faabAmount: updates.faab_amount,
    });
    if (!updated) throw new ValidationException('Claim could not be updated');

    return updated;
  }

  async cancelWaiverClaim(leagueId: string, claimId: string, userId: string): Promise<void> {
    const claim = await this.txRepo.findWaiverClaimById(claimId);
    if (!claim) throw new NotFoundException('Waiver claim not found');
    if (claim.userId !== userId) throw new ForbiddenException('You can only cancel your own claims');
    if (claim.leagueId !== leagueId) throw new NotFoundException('Waiver claim not found');

    const cancelled = await this.txRepo.cancelClaim(claimId);
    if (!cancelled) throw new ValidationException('Claim could not be cancelled');
  }

  async getMyWaiverClaims(leagueId: string, userId: string): Promise<WaiverClaim[]> {
    const member = await this.leagueRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return this.txRepo.findPendingClaimsByUser(leagueId, userId);
  }

  async getTransactionFeed(
    leagueId: string,
    userId: string,
    filters?: { type?: string; limit?: number; offset?: number },
  ): Promise<{ transactions: Transaction[]; total: number; limit: number; offset: number }> {
    const member = await this.leagueRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const result = await this.txRepo.findByLeague(leagueId, filters);
    return {
      ...result,
      limit: filters?.limit ?? 25,
      offset: filters?.offset ?? 0,
    };
  }

  // ---- Waiver Processing ----

  async processAllPendingWaivers(): Promise<void> {
    const leagueIds = await this.txRepo.findPendingClaimsForProcessing();
    for (const leagueId of leagueIds) {
      try {
        await this.processLeagueWaivers(leagueId);
      } catch (err) {
        console.error(`[TransactionService] Failed to process waivers for league ${leagueId}:`, err);
      }
    }
  }

  async processLeagueWaivers(leagueId: string): Promise<void> {
    const league = await this.leagueRepo.findById(leagueId);
    if (!league) return;

    await this.txRepo.withTransaction(async (client) => {
      // Advisory lock to prevent concurrent processing
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [leagueId]);

      const claims = await this.txRepo.findPendingClaimsByLeague(client, leagueId);
      if (claims.length === 0) return;

      // Group claims by player
      const claimsByPlayer = new Map<string, WaiverClaim[]>();
      for (const claim of claims) {
        const existing = claimsByPlayer.get(claim.playerId) ?? [];
        existing.push(claim);
        claimsByPlayer.set(claim.playerId, existing);
      }

      const processedRosters = new Set<number>();

      for (const [playerId, playerClaims] of claimsByPlayer) {
        // Claims are already sorted by faab_amount DESC, priority ASC from the query
        let winner: WaiverClaim | null = null;

        for (const claim of playerClaims) {
          // Skip if this roster already won a claim this round
          if (processedRosters.has(claim.rosterId)) {
            await this.txRepo.updateClaimStatus(client, claim.id, 'failed');
            continue;
          }

          // Validate roster still has room or has drop player
          const roster = await this.leagueRepo.findRosterByOwner(leagueId, claim.userId);
          if (!roster) {
            await this.txRepo.updateClaimStatus(client, claim.id, 'invalid');
            continue;
          }

          // For FAAB leagues, check budget
          if (league.settings.waiver_type === 2 && claim.faabAmount > 0) {
            const deducted = await this.txRepo.deductFaab(client, leagueId, claim.userId, claim.faabAmount);
            if (!deducted) {
              await this.txRepo.updateClaimStatus(client, claim.id, 'failed');
              continue;
            }
          }

          // Execute the claim
          await this.txRepo.addPlayerToRoster(client, leagueId, claim.userId, playerId);

          if (claim.dropPlayerId) {
            await this.txRepo.removePlayerFromRoster(client, leagueId, claim.userId, claim.dropPlayerId);
            const clearDays = league.settings.waiver_clear_days ?? 2;
            await this.txRepo.createPlayerWaiver(client, leagueId, claim.dropPlayerId, claim.userId, clearDays);
          }

          const adds: Record<string, number> = { [playerId]: claim.rosterId };
          const drops: Record<string, number> = {};
          if (claim.dropPlayerId) drops[claim.dropPlayerId] = claim.rosterId;

          const tx = await this.txRepo.createTransaction(client, {
            leagueId,
            type: 'waiver',
            status: 'complete',
            rosterIds: [claim.rosterId],
            playerIds: [playerId, ...(claim.dropPlayerId ? [claim.dropPlayerId] : [])],
            adds,
            drops,
            settings: { faab_amount: claim.faabAmount },
            createdBy: claim.userId,
          });

          await this.txRepo.updateClaimStatus(client, claim.id, 'successful', tx.id);
          winner = claim;
          processedRosters.add(claim.rosterId);
          break;
        }

        // Mark remaining claims as outbid
        for (const claim of playerClaims) {
          if (winner && claim.id !== winner.id && claim.status === 'pending') {
            await this.txRepo.updateClaimStatus(client, claim.id, 'outbid');
          }
        }
      }

      // Clean expired player waivers
      await this.txRepo.cleanExpiredWaivers();
    });

    this.gateway?.broadcastToLeague(leagueId, 'waiver:processed', { league_id: leagueId });
    this.gateway?.broadcastToLeague(leagueId, 'roster:updated', { league_id: leagueId });
  }

  // ---- Helpers ----

  private calculateWaiverProcessTime(settings: any): Date {
    const now = new Date();
    const clearDays = settings.waiver_clear_days ?? 2;
    const dayOfWeek = settings.waiver_day_of_week ?? 2; // Tuesday
    const hour = settings.daily_waivers_hour ?? 11;

    // Find next processing window
    const processAt = new Date(now);
    processAt.setHours(hour, 0, 0, 0);

    // Move to next waiver day
    const currentDay = processAt.getDay();
    let daysUntilProcess = dayOfWeek - currentDay;
    if (daysUntilProcess <= 0) daysUntilProcess += 7;
    if (daysUntilProcess === 0 && now >= processAt) daysUntilProcess = 7;

    processAt.setDate(processAt.getDate() + daysUntilProcess);

    // Ensure minimum clear days
    const minProcess = new Date(now);
    minProcess.setDate(minProcess.getDate() + clearDays);
    if (processAt < minProcess) {
      processAt.setDate(processAt.getDate() + 7);
    }

    return processAt;
  }
}
