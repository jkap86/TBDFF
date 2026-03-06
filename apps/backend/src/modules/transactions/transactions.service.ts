import { TransactionRepository } from './transactions.repository';
import { Transaction, WaiverClaim } from './transactions.model';
import { LeagueRepository } from '../leagues/leagues.repository';
import { LeagueMembersRepository } from '../leagues/league-members.repository';
import { LeagueRostersRepository } from '../leagues/league-rosters.repository';
import { PlayerRepository } from '../players/players.repository';
import { TransactionsGateway } from './transactions.gateway';
import { SystemMessageService } from '../chat/system-message.service';
import {
  NotFoundException,
  ForbiddenException,
  ValidationException,
} from '../../shared/exceptions';

export class TransactionService {
  private gateway: TransactionsGateway | null = null;
  private systemMessages: SystemMessageService | null = null;

  constructor(
    private readonly txRepo: TransactionRepository,
    private readonly leagueRepo: LeagueRepository,
    private readonly leagueMembersRepo: LeagueMembersRepository,
    private readonly leagueRostersRepo: LeagueRostersRepository,
    private readonly playerRepo?: PlayerRepository,
  ) {}

  setGateway(gw: TransactionsGateway): void {
    this.gateway = gw;
  }

  setSystemMessages(sms: SystemMessageService): void {
    this.systemMessages = sms;
  }

  async addFreeAgent(
    leagueId: string,
    userId: string,
    playerId: string,
    dropPlayerId?: string,
  ): Promise<Transaction> {
    const member = await this.leagueMembersRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const league = await this.leagueRepo.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    if (league.settings.disable_adds) throw new ValidationException('Adds are disabled for this league');
    if (league.status === 'not_filled') {
      throw new ValidationException('Adds are not allowed before the league is active');
    }
    if (league.status === 'complete' && !league.settings.offseason_adds) {
      throw new ValidationException('Adds are not allowed after the season is complete');
    }

    const roster = await this.leagueRostersRepo.findRosterByOwner(leagueId, userId);
    if (!roster) throw new ValidationException('You do not own a roster in this league');

    // Validate drop player if specified
    if (dropPlayerId && !roster.players.includes(dropPlayerId)) {
      throw new ValidationException('Drop player is not on your roster');
    }

    // Check roster limits (total roster size vs position slots)
    const maxRosterSize = league.rosterPositions.length;
    if (!dropPlayerId && roster.players.length >= maxRosterSize) {
      throw new ValidationException('Roster is full. You must drop a player.');
    }

    const tx = await this.txRepo.withTransaction(async (client) => {
      // Per-player advisory lock prevents concurrent adds of the same player
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${leagueId}:${playerId}`]);

      // Row-lock the roster to prevent concurrent roster mutations (different players)
      const lockedRoster = await this.leagueRostersRepo.findRosterByOwnerForUpdate(leagueId, userId, client);
      if (!lockedRoster) throw new ValidationException('You do not own a roster in this league');

      // Authoritative checks under row lock
      if (dropPlayerId && !lockedRoster.players.includes(dropPlayerId)) {
        throw new ValidationException('Drop player is not on your roster');
      }
      if (!dropPlayerId && lockedRoster.players.length >= maxRosterSize) {
        throw new ValidationException('Roster is full. You must drop a player.');
      }

      // Re-check under lock: player not already rostered league-wide
      const rostered = await this.txRepo.isPlayerRosteredInLeague(client, leagueId, playerId);
      if (rostered) throw new ValidationException('This player is already on a roster');

      // Re-check under lock: player not on waivers
      const onWaivers = await this.txRepo.isPlayerOnWaivers(leagueId, playerId, client);
      if (onWaivers) throw new ValidationException('This player is on waivers. You must place a waiver claim.');

      const adds: Record<string, number> = { [playerId]: lockedRoster.rosterId };
      const drops: Record<string, number> = {};
      const playerIds = [playerId];

      // Add player
      const added = await this.txRepo.addPlayerToRoster(client, leagueId, userId, playerId);
      if (!added) throw new ValidationException('Failed to add player to roster');

      // Drop player if specified
      if (dropPlayerId) {
        const removed = await this.txRepo.removePlayerFromRoster(client, leagueId, userId, dropPlayerId);
        if (!removed) throw new ValidationException('Drop player is no longer on your roster');
        drops[dropPlayerId] = lockedRoster.rosterId;
        playerIds.push(dropPlayerId);

        // Put dropped player on waivers
        const clearDays = league.settings.waiver_clear_days ?? 2;
        await this.txRepo.createPlayerWaiver(client, leagueId, dropPlayerId, userId, clearDays);
      }

      return this.txRepo.createTransaction(client, {
        leagueId,
        type: 'free_agent',
        status: 'complete',
        rosterIds: [lockedRoster.rosterId],
        playerIds,
        adds,
        drops,
        createdBy: userId,
      });
    });

    // Post-commit broadcasts
    this.gateway?.broadcastToLeague(leagueId, 'transaction:new', { transaction: tx.toSafeObject() });
    this.gateway?.broadcastToLeague(leagueId, 'roster:updated', { league_id: leagueId });

    return tx;
  }

  async dropPlayer(leagueId: string, userId: string, playerId: string): Promise<Transaction> {
    const member = await this.leagueMembersRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const league = await this.leagueRepo.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const roster = await this.leagueRostersRepo.findRosterByOwner(leagueId, userId);
    if (!roster) throw new ValidationException('You do not own a roster in this league');

    if (!roster.players.includes(playerId)) {
      throw new ValidationException('This player is not on your roster');
    }

    const tx = await this.txRepo.withTransaction(async (client) => {
      // Per-player advisory lock prevents concurrent drops of the same player
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${leagueId}:${playerId}`]);

      const removed = await this.txRepo.removePlayerFromRoster(client, leagueId, userId, playerId);
      if (!removed) throw new ValidationException('This player is no longer on your roster');

      // Put player on waivers
      const clearDays = league.settings.waiver_clear_days ?? 2;
      await this.txRepo.createPlayerWaiver(client, leagueId, playerId, userId, clearDays);

      return this.txRepo.createTransaction(client, {
        leagueId,
        type: 'free_agent',
        status: 'complete',
        rosterIds: [roster.rosterId],
        playerIds: [playerId],
        drops: { [playerId]: roster.rosterId },
        createdBy: userId,
      });
    });

    // Post-commit broadcasts
    this.gateway?.broadcastToLeague(leagueId, 'transaction:new', { transaction: tx.toSafeObject() });
    this.gateway?.broadcastToLeague(leagueId, 'roster:updated', { league_id: leagueId });

    return tx;
  }

  async placeWaiverClaim(
    leagueId: string,
    userId: string,
    request: { player_id: string; drop_player_id?: string; faab_amount?: number },
  ): Promise<WaiverClaim> {
    const member = await this.leagueMembersRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const league = await this.leagueRepo.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const roster = await this.leagueRostersRepo.findRosterByOwner(leagueId, userId);
    if (!roster) throw new ValidationException('You do not own a roster in this league');

    // Check player is already rostered
    const allRosters = await this.leagueRostersRepo.findRostersByLeagueId(leagueId);
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

  async getMyWaiverClaims(leagueId: string, userId: string): Promise<{ claims: WaiverClaim[]; player_names: Record<string, string> }> {
    const member = await this.leagueMembersRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const claims = await this.txRepo.findPendingClaimsByUser(leagueId, userId);
    const playerNames = await this.resolvePlayerNames(
      [...claims.map((c) => c.playerId), ...claims.map((c) => c.dropPlayerId).filter(Boolean) as string[]],
    );
    return { claims, player_names: playerNames };
  }

  async getTransactionFeed(
    leagueId: string,
    userId: string,
    filters?: { type?: string; limit?: number; offset?: number },
  ): Promise<{ transactions: Transaction[]; total: number; limit: number; offset: number; player_names: Record<string, string> }> {
    const member = await this.leagueMembersRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const result = await this.txRepo.findByLeague(leagueId, filters);

    // Collect all unique player IDs from adds/drops
    const playerIds = new Set<string>();
    for (const tx of result.transactions) {
      for (const pid of Object.keys(tx.adds)) playerIds.add(pid);
      for (const pid of Object.keys(tx.drops)) playerIds.add(pid);
    }
    const playerNames = await this.resolvePlayerNames(Array.from(playerIds));

    return {
      ...result,
      limit: filters?.limit ?? 25,
      offset: filters?.offset ?? 0,
      player_names: playerNames,
    };
  }

  private async resolvePlayerNames(playerIds: string[]): Promise<Record<string, string>> {
    if (!this.playerRepo || playerIds.length === 0) return {};
    const unique = [...new Set(playerIds)];
    const players = await this.playerRepo.findByIds(unique);
    const map: Record<string, string> = {};
    for (const p of players) {
      map[p.id] = p.fullName;
    }
    return map;
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
    // Track successful claims for the system message (populated inside transaction)
    const successfulClaims: Array<{ userId: string; playerId: string }> = [];

    await this.txRepo.withTransaction(async (client) => {
      // Advisory lock to prevent concurrent processing
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [leagueId]);

      // Read league state within the transaction
      const league = await this.leagueRepo.findById(leagueId, client);
      if (!league) return;

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

      const maxRosterSize = league.rosterPositions.length;

      for (const [playerId, playerClaims] of claimsByPlayer) {
        // Claims are already sorted by faab_amount DESC, priority ASC from the query
        let winner: WaiverClaim | null = null;

        for (const claim of playerClaims) {
          // Skip if this roster already won a claim this round
          if (processedRosters.has(claim.rosterId)) {
            await this.txRepo.updateClaimStatus(client, claim.id, 'failed');
            continue;
          }

          // Row-lock the roster to prevent concurrent mutations
          const roster = await this.leagueRostersRepo.findRosterByOwnerForUpdate(leagueId, claim.userId, client);
          if (!roster) {
            await this.txRepo.updateClaimStatus(client, claim.id, 'invalid');
            continue;
          }

          // Authoritative stale-drop check
          if (claim.dropPlayerId && !roster.players.includes(claim.dropPlayerId)) {
            await this.txRepo.updateClaimStatus(client, claim.id, 'invalid');
            continue;
          }

          // Authoritative roster-full check (no drop specified)
          if (!claim.dropPlayerId && roster.players.length >= maxRosterSize) {
            await this.txRepo.updateClaimStatus(client, claim.id, 'invalid');
            continue;
          }

          // Add player first — if it fails (player already rostered), no FAAB is touched
          const added = await this.txRepo.addPlayerToRoster(client, leagueId, claim.userId, playerId);
          if (!added) {
            // Player already on this roster — treat as invalid
            await this.txRepo.updateClaimStatus(client, claim.id, 'invalid');
            continue;
          }

          // For FAAB leagues, deduct budget after successful add
          let faabDeducted = false;
          if (league.settings.waiver_type === 2 && claim.faabAmount > 0) {
            const deducted = await this.txRepo.deductFaab(client, leagueId, claim.userId, claim.faabAmount);
            if (!deducted) {
              // Undo the roster add since FAAB is insufficient
              await this.txRepo.removePlayerFromRoster(client, leagueId, claim.userId, playerId);
              await this.txRepo.updateClaimStatus(client, claim.id, 'failed');
              continue;
            }
            faabDeducted = true;
          }

          if (claim.dropPlayerId) {
            const dropped = await this.txRepo.removePlayerFromRoster(client, leagueId, claim.userId, claim.dropPlayerId);
            if (!dropped) {
              // Drop unexpectedly failed — undo the add and refund FAAB if deducted
              await this.txRepo.removePlayerFromRoster(client, leagueId, claim.userId, playerId);
              if (faabDeducted) {
                await this.txRepo.refundFaab(client, leagueId, claim.userId, claim.faabAmount);
              }
              await this.txRepo.updateClaimStatus(client, claim.id, 'invalid');
              continue;
            }
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

          // Rotate waiver priority: winner drops to last
          if (league.settings.waiver_type !== 2) {
            await this.txRepo.rotateWaiverPriority(client, leagueId, claim.rosterId);
          }

          winner = claim;
          processedRosters.add(claim.rosterId);
          successfulClaims.push({ userId: claim.userId, playerId });
          break;
        }

        // Mark remaining claims as outbid
        for (const claim of playerClaims) {
          if (winner && claim.id !== winner.id && claim.status === 'pending') {
            await this.txRepo.updateClaimStatus(client, claim.id, 'outbid');
          }
        }
      }

      // Clean expired player waivers (within transaction)
      await this.txRepo.cleanExpiredWaivers(client);
    });

    this.gateway?.broadcastToLeague(leagueId, 'waiver:processed', { league_id: leagueId });
    this.gateway?.broadcastToLeague(leagueId, 'roster:updated', { league_id: leagueId });

    // Send system message summarizing successful waiver claims
    if (successfulClaims.length > 0) {
      try {
        // Look up player names
        const playerIds = successfulClaims.map((c) => c.playerId);
        const playerNameMap: Record<string, string> = {};
        if (this.playerRepo) {
          const players = await this.playerRepo.findByIds(playerIds);
          for (const p of players) playerNameMap[p.id] = p.fullName;
        }

        // Look up usernames
        const userIds = [...new Set(successfulClaims.map((c) => c.userId))];
        const userNameMap: Record<string, string> = {};
        for (const uid of userIds) {
          const member = await this.leagueMembersRepo.findMember(leagueId, uid);
          if (member) userNameMap[uid] = member.username;
        }

        const parts = successfulClaims.map((c) => {
          const userName = userNameMap[c.userId] ?? 'Unknown';
          const playerName = playerNameMap[c.playerId] ?? c.playerId;
          return `${userName} claimed ${playerName}`;
        });

        await this.systemMessages?.send(
          leagueId,
          `Waivers processed: ${parts.join(', ')}`,
          { event: 'waivers_processed' },
        );
      } catch { /* non-fatal */ }
    }
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
    if (daysUntilProcess === 0 && now >= processAt) daysUntilProcess = 7;
    else if (daysUntilProcess <= 0) daysUntilProcess += 7;

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
