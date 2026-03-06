import { DraftRepository } from './drafts.repository';
import { DraftPicksRepository } from './draft-picks.repository';
import { DraftQueueRepository } from './draft-queue.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { LeagueMembersRepository } from '../leagues/league-members.repository';
import { PlayerRepository } from '../players/players.repository';
import { AuctionAutoBidService } from './auction-auto-bid.service';
import { DraftGateway } from './draft.gateway';
import {
  Draft,
  DraftPick,
  AuctionNomination,
} from './drafts.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../../shared/exceptions';
import { findUserBySlot, findRosterIdByUserId, getMaxPlayersPerTeam, assertBudgetExists } from './draft-helpers';

/**
 * Manages auction draft logic: nominations, bidding, and resolution.
 */
export class AuctionService {
  /** Optional WebSocket gateway for broadcasting draft state changes */
  private draftGateway?: DraftGateway;

  constructor(
    private readonly draftRepository: DraftRepository,
    private readonly draftQueueRepository: DraftQueueRepository,
    private readonly draftPicksRepository: DraftPicksRepository,
    private readonly leagueRepository: LeagueRepository,
    private readonly leagueMembersRepository: LeagueMembersRepository,
    private readonly playerRepository: PlayerRepository,
    private readonly autoBidService: AuctionAutoBidService,
  ) {}

  /** Inject the draft gateway after socket.io setup (avoids circular dependency at construction time) */
  setGateway(gateway: DraftGateway): void {
    this.draftGateway = gateway;
  }

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

    if ((draft.metadata?.clock_state ?? 'running') === 'stopped') {
      throw new ValidationException('Draft is stopped by commissioner');
    }

    const member = await this.leagueMembersRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('Not a member of this league');

    if (draft.metadata?.current_nomination) {
      throw new ConflictException('A nomination is already active');
    }

    const nextPick = await this.draftPicksRepository.findNextPick(draftId);
    if (!nextPick) throw new ValidationException('All nominations complete');

    const userSlot = draft.draftOrder[userId];
    if (userSlot === undefined) throw new ForbiddenException('No draft slot assigned');

    const isCommissioner = member.role === 'commissioner';
    if (!isCommissioner && nextPick.draftSlot !== userSlot) {
      throw new ForbiddenException('It is not your turn to nominate');
    }

    if (amount < 1) throw new ValidationException('Minimum bid is $1');

    const alreadyPicked = await this.draftPicksRepository.isPlayerPicked(draftId, playerId);
    if (alreadyPicked) throw new ConflictException('Player already drafted');

    const nominatorRosterId = findRosterIdByUserId(draft, userId);
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

    const bidDeadline = new Date(Date.now() + draft.settings.nomination_timer * 1000).toISOString();

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

    await this.autoBidService.scheduleAutoBids(draftId);
    this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated, server_time: new Date().toISOString() });
    return updated;
  }

  async placeBid(
    draftId: string,
    userId: string,
    amount: number,
  ): Promise<{ draft: Draft; won?: DraftPick }> {
    // Light pre-checks outside transaction
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status !== 'drafting') throw new ValidationException('Draft is not active');
    if (draft.type !== 'auction') throw new ValidationException('Not an auction draft');

    if ((draft.metadata?.clock_state ?? 'running') === 'stopped') {
      throw new ValidationException('Draft is stopped by commissioner');
    }

    const member = await this.leagueMembersRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('Not a member');

    // If deadline already passed, delegate to resolve instead of bidding
    const preNomination = draft.metadata?.current_nomination;
    if (preNomination) {
      const deadline = new Date(preNomination.bid_deadline).getTime();
      if (Date.now() > deadline) {
        return this.resolveNomination(draftId, userId);
      }
    }

    // All bid logic under advisory lock to prevent concurrent clobber
    const updated = await this.draftRepository.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [draftId]);

      const freshDraft = await this.draftRepository.findById(draftId, client);
      if (!freshDraft || freshDraft.status !== 'drafting') {
        throw new ValidationException('Draft is no longer active');
      }

      const nomination = freshDraft.metadata?.current_nomination;
      if (!nomination) throw new ValidationException('No active nomination');

      const dl = new Date(nomination.bid_deadline).getTime();
      if (Date.now() > dl) {
        throw new ValidationException('Bid deadline has expired');
      }

      if (amount <= nomination.current_bid) {
        throw new ValidationException(`Bid must be greater than $${nomination.current_bid}`);
      }

      if (userId === nomination.current_bidder) {
        throw new ValidationException('You already have the highest bid');
      }

      const bidderRosterId = findRosterIdByUserId(freshDraft, userId);
      if (bidderRosterId === null) throw new ForbiddenException('No roster found');

      await this.validateBudget(freshDraft, bidderRosterId, amount, client);

      const newDeadline = new Date(Date.now() + freshDraft.settings.nomination_timer * 1000).toISOString();

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

      return this.draftRepository.update(draftId, {
        metadata: {
          ...freshDraft.metadata,
          current_nomination: updatedNomination,
        },
        lastPicked: new Date().toISOString(),
      }, client);
    });

    if (!updated) throw new NotFoundException('Draft not found');

    await this.autoBidService.scheduleAutoBids(draftId);
    this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated, server_time: new Date().toISOString() });
    return { draft: updated };
  }

  async resolveNomination(
    draftId: string,
    userId: string,
  ): Promise<{ draft: Draft; won?: DraftPick }> {
    // Pre-checks outside transaction
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    const resolveClockState = draft.metadata?.clock_state ?? 'running';
    if (resolveClockState === 'paused' || resolveClockState === 'stopped') {
      throw new ValidationException('Draft is paused or stopped by commissioner');
    }

    const member = await this.leagueMembersRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('Not a member of this league');

    // Entire resolution under advisory lock in a single transaction
    const { resultDraft, pick } = await this.draftRepository.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [draftId]);

      const freshDraft = await this.draftRepository.findById(draftId, client);
      if (!freshDraft) throw new NotFoundException('Draft not found');

      let nomination = freshDraft.metadata?.current_nomination;
      if (!nomination) {
        // Already resolved — idempotent return
        return { resultDraft: freshDraft, pick: undefined };
      }

      // Guard: do not resolve if the bid deadline has not expired yet
      if (nomination.bid_deadline) {
        const deadline = new Date(nomination.bid_deadline).getTime();
        if (Date.now() < deadline) {
          throw new ValidationException('Bid deadline has not expired yet');
        }
      }

      // Defensive: if winner's roster is full, find an eligible fallback team
      const winnerPicksWon = await this.draftPicksRepository.countPicksWonByRoster(
        draftId,
        nomination.bidder_roster_id,
        client,
      );
      if (winnerPicksWon >= getMaxPlayersPerTeam(freshDraft)) {
        const fallback = await this.findEligibleInitialBidder(freshDraft, null, client);
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

      // Atomic pick: the repo's WHERE player_id IS NULL clause ensures that
      // concurrent resolveNomination calls are idempotent — only the first
      // caller writes the pick; subsequent callers get null and return early.
      const resolvedPick = await this.draftPicksRepository.makeAuctionPick(
        nomination.pick_id,
        nomination.player_id,
        nomination.current_bidder,
        nomination.bidder_roster_id,
        nomination.current_bid,
        pickMetadata,
        client,
      );

      if (!resolvedPick) {
        // Another call already resolved this nomination — return current state
        return { resultDraft: freshDraft, pick: undefined };
      }

      // Deduct budget within the same transaction
      const afterDeduct = await this.draftPicksRepository.deductBudget(
        draftId,
        nomination.bidder_roster_id,
        nomination.current_bid,
        client,
      );
      if (!afterDeduct) {
        throw new ValidationException(
          `Budget deduction failed for roster ${nomination.bidder_roster_id} amount $${nomination.current_bid}`,
        );
      }

      // Check if draft is complete (all picks made)
      const completed = await this.draftPicksRepository.completeAndUpdateLeagueInTx(
        client,
        draftId,
        freshDraft.leagueId,
      );
      if (completed) {
        // Clear nomination state on completion
        await this.draftRepository.update(draftId, {
          metadata: {
            ...completed.metadata,
            current_nomination: null,
            nomination_deadline: null,
          },
        }, client);
        const finalDraft = await this.draftRepository.findById(draftId, client);
        return { resultDraft: finalDraft!, pick: resolvedPick };
      }

      // Set up next nomination deadline
      const nominationDeadline = new Date(
        Date.now() + (freshDraft.settings.offering_timer || freshDraft.settings.nomination_timer) * 1000,
      ).toISOString();

      await this.draftRepository.update(draftId, {
        metadata: {
          ...afterDeduct.metadata,
          current_nomination: null,
          nomination_deadline: nominationDeadline,
        },
        lastPicked: new Date().toISOString(),
      }, client);

      const finalDraft = await this.draftRepository.findById(draftId, client);
      return { resultDraft: finalDraft!, pick: resolvedPick };
    });

    // Post-transaction side effects (broadcasts, scheduling)
    if (resultDraft.status === 'complete') {
      await this.autoBidService.cancelScheduledAutoBids(draftId);
    }

    if (pick) {
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: resultDraft, pick, server_time: new Date().toISOString() });

      // Check if next nominator is on auto-pick (only if draft is still active)
      if (resultDraft.status === 'drafting') {
        await this.processAutoNomination(draftId);
      }
    }

    return { draft: resultDraft, won: pick };
  }

  async autoNominate(draftId: string, userId: string): Promise<Draft> {
    // Pre-checks outside transaction
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.type !== 'auction') throw new ValidationException('Not an auction draft');
    if (draft.status !== 'drafting') throw new ValidationException('Draft is not active');

    const autoNomClockState = draft.metadata?.clock_state ?? 'running';
    if (autoNomClockState === 'paused' || autoNomClockState === 'stopped') {
      throw new ValidationException('Draft is paused or stopped by commissioner');
    }

    const member = await this.leagueMembersRepository.findMember(draft.leagueId, userId);
    const isCommissioner = member?.role === 'commissioner';

    // All mutation logic under advisory lock
    const updated = await this.draftRepository.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [draftId]);

      let freshDraft = await this.draftRepository.findById(draftId, client);
      if (!freshDraft || freshDraft.status !== 'drafting') {
        throw new ValidationException('Draft is no longer active');
      }

      if (freshDraft.metadata?.current_nomination) {
        throw new ValidationException('A nomination is already active');
      }

      if (!isCommissioner) {
        const deadline = freshDraft.metadata?.nomination_deadline;
        if (deadline && Date.now() < new Date(deadline).getTime()) {
          throw new ValidationException('Nomination timer has not expired');
        }
      }

      let nextPick = await this.draftPicksRepository.findNextPick(draftId, client);
      if (!nextPick) throw new ValidationException('All nominations complete');

      // Enable auto-pick for the timed-out nominator (the original slot owner who missed their turn)
      const originalSlotOwner = findUserBySlot(freshDraft.draftOrder, nextPick.draftSlot);
      if (originalSlotOwner) {
        const addResult = await this.draftRepository.addAutoPickUser(draftId, originalSlotOwner, client);
        if (addResult) freshDraft = addResult;
      }

      // Forfeit nomination slots for full-roster teams until an eligible nominator is found
      let nominatorRosterId = freshDraft.slotToRosterId[String(nextPick.draftSlot)];
      let nominatorPicksWon = await this.draftPicksRepository.countPicksWonByRoster(
        draftId, nominatorRosterId, client,
      );

      while (nominatorPicksWon >= getMaxPlayersPerTeam(freshDraft)) {
        await this.draftPicksRepository.forfeitPick(nextPick.id, client);

        nextPick = await this.draftPicksRepository.findNextPick(draftId, client);
        if (!nextPick) {
          // All remaining nomination slots forfeited — complete the draft
          const completed = await this.draftPicksRepository.completeAndUpdateLeagueInTx(
            client, draftId, freshDraft.leagueId,
          );
          if (completed) {
            await this.autoBidService.cancelScheduledAutoBids(draftId);
            await this.draftRepository.update(draftId, {
              metadata: {
                ...completed.metadata,
                current_nomination: null,
                nomination_deadline: null,
              },
            }, client);
          }
          return (await this.draftRepository.findById(draftId, client))!;
        }

        nominatorRosterId = freshDraft.slotToRosterId[String(nextPick.draftSlot)];
        nominatorPicksWon = await this.draftPicksRepository.countPicksWonByRoster(
          draftId, nominatorRosterId, client,
        );
      }

      const slotOwner = findUserBySlot(freshDraft.draftOrder, nextPick.draftSlot);

      // Try the eligible nominator's queue first, fall back to best available
      const auctionPlayerType = freshDraft.settings.player_type;
      const queuedPlayer = slotOwner
        ? await this.draftQueueRepository.findFirstAvailableFromQueue(draftId, slotOwner, client, auctionPlayerType)
        : null;
      const bestPlayer = queuedPlayer ?? (await this.draftPicksRepository.findBestAvailable(draftId, client, auctionPlayerType));
      if (!bestPlayer) throw new ValidationException('No available players');

      // Determine initial bidder — must have valid budget for $1
      let bidderId: string;
      let bidderRosterId: number;

      if (slotOwner) {
        try {
          await this.validateBudget(freshDraft, nominatorRosterId, 1, client);
          bidderId = slotOwner;
          bidderRosterId = nominatorRosterId;
        } catch {
          // Slot owner can't afford $1 — find an eligible fallback
          const fallback = await this.findEligibleInitialBidder(freshDraft, slotOwner, client);
          if (!fallback) throw new ValidationException('No eligible bidder available');
          bidderId = fallback.userId;
          bidderRosterId = fallback.rosterId;
        }
      } else {
        // No slot owner — find any eligible bidder
        const fallback = await this.findEligibleInitialBidder(freshDraft, null, client);
        if (!fallback) throw new ValidationException('No eligible bidder available');
        bidderId = fallback.userId;
        bidderRosterId = fallback.rosterId;
      }

      const bidDeadline = new Date(Date.now() + freshDraft.settings.nomination_timer * 1000).toISOString();

      const nomination: AuctionNomination = {
        pick_id: nextPick.id,
        player_id: bestPlayer.id,
        nominated_by: slotOwner || userId,
        current_bid: 1,
        current_bidder: bidderId,
        bidder_roster_id: bidderRosterId,
        bid_deadline: bidDeadline,
        bid_history: [
          {
            user_id: bidderId,
            amount: 1,
            timestamp: new Date().toISOString(),
          },
        ],
        player_metadata: {
          first_name: bestPlayer.firstName,
          last_name: bestPlayer.lastName,
          full_name: bestPlayer.fullName,
          position: bestPlayer.position,
          team: bestPlayer.team,
          auction_value: bestPlayer.auctionValue ?? null,
        },
      };

      return this.draftRepository.update(draftId, {
        metadata: {
          ...freshDraft.metadata,
          current_nomination: nomination,
          nomination_deadline: null,
        },
        lastPicked: new Date().toISOString(),
      }, client);
    });

    if (!updated) throw new NotFoundException('Draft not found');

    await this.autoBidService.scheduleAutoBids(draftId);
    this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated, server_time: new Date().toISOString() });
    return updated;
  }

  private async processAutoNomination(draftId: string): Promise<void> {
    // Pre-check outside transaction
    const draft = await this.draftRepository.findById(draftId);
    if (!draft || draft.status !== 'drafting' || draft.type !== 'auction') return;
    if (draft.metadata?.current_nomination) return;

    // All mutation logic under advisory lock
    const updated = await this.draftRepository.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [draftId]);

      const freshDraft = await this.draftRepository.findById(draftId, client);
      if (!freshDraft || freshDraft.status !== 'drafting' || freshDraft.type !== 'auction') return null;
      if (freshDraft.metadata?.current_nomination) return null;

      const nextPick = await this.draftPicksRepository.findNextPick(draftId, client);
      if (!nextPick) return null;

      const autoPickUsers: string[] = freshDraft.metadata?.auto_pick_users ?? [];
      const slotOwner = findUserBySlot(freshDraft.draftOrder, nextPick.draftSlot);

      if (!slotOwner || !autoPickUsers.includes(slotOwner)) return null;

      const queuedPlayer = await this.draftQueueRepository.findFirstAvailableFromQueue(
        draftId, slotOwner, client,
      );
      const bestPlayer = queuedPlayer ?? (await this.draftPicksRepository.findBestAvailable(draftId, client));
      if (!bestPlayer) return null;

      const nominatorRosterId = freshDraft.slotToRosterId[String(nextPick.draftSlot)];

      // If nominator's roster is full, skip auto-nominate — the offering timer will
      // expire and resolveNomination will advance to the next pick slot naturally.
      const nominatorPicksWon = await this.draftPicksRepository.countPicksWonByRoster(
        draftId, nominatorRosterId, client,
      );
      if (nominatorPicksWon >= getMaxPlayersPerTeam(freshDraft)) {
        return null;
      }

      // Determine initial bidder — validate budget for $1
      let bidderId: string;
      let bidderRosterId: number;

      try {
        await this.validateBudget(freshDraft, nominatorRosterId, 1, client);
        bidderId = slotOwner;
        bidderRosterId = nominatorRosterId;
      } catch {
        // Slot owner can't afford $1 — find an eligible fallback
        const fallback = await this.findEligibleInitialBidder(freshDraft, slotOwner, client);
        if (!fallback) return null;
        bidderId = fallback.userId;
        bidderRosterId = fallback.rosterId;
      }

      const bidDeadline = new Date(
        Date.now() + freshDraft.settings.nomination_timer * 1000,
      ).toISOString();

      const nomination: AuctionNomination = {
        pick_id: nextPick.id,
        player_id: bestPlayer.id,
        nominated_by: slotOwner,
        current_bid: 1,
        current_bidder: bidderId,
        bidder_roster_id: bidderRosterId,
        bid_deadline: bidDeadline,
        bid_history: [{ user_id: bidderId, amount: 1, timestamp: new Date().toISOString() }],
        player_metadata: {
          first_name: bestPlayer.firstName,
          last_name: bestPlayer.lastName,
          full_name: bestPlayer.fullName,
          position: bestPlayer.position,
          team: bestPlayer.team,
          auction_value: bestPlayer.auctionValue ?? null,
        },
      };

      return this.draftRepository.update(draftId, {
        metadata: {
          ...freshDraft.metadata,
          current_nomination: nomination,
          nomination_deadline: null,
        },
        lastPicked: new Date().toISOString(),
      }, client);
    });

    if (updated) {
      await this.autoBidService.scheduleAutoBids(draftId);
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated, server_time: new Date().toISOString() });
    }
  }

  private async validateBudget(
    draft: Draft,
    rosterId: number,
    bidAmount: number,
    client?: import('pg').PoolClient,
  ): Promise<void> {
    const budgets: Record<string, number> = draft.metadata?.auction_budgets ?? {};
    assertBudgetExists(budgets, rosterId, 'budget validation');
    const currentBudget = budgets[String(rosterId)];

    const picksWon = await this.draftPicksRepository.countPicksWonByRoster(draft.id, rosterId, client);
    const totalSlots = getMaxPlayersPerTeam(draft);
    const remainingSlots = totalSlots - picksWon;

    if (remainingSlots <= 0) {
      throw new ValidationException('Your roster is full');
    }

    // Must keep $1 per remaining unfilled slot (excluding the one being bid on)
    const reserveNeeded = Math.max(0, remainingSlots - 1);
    const maxBid = currentBudget - reserveNeeded;

    if (bidAmount > maxBid) {
      throw new ValidationException(
        `Bid exceeds budget. Max bid: $${maxBid} (budget: $${currentBudget}, must reserve $${reserveNeeded})`,
      );
    }
  }

  /**
   * Find the first team with remaining roster slots and enough budget
   * to place a minimum $1 bid. Used when the nominator's roster is full.
   */
  private async findEligibleInitialBidder(
    draft: Draft,
    excludeUserId: string | null,
    client?: import('pg').PoolClient,
  ): Promise<{ userId: string; rosterId: number } | null> {
    const budgets: Record<string, number> = draft.metadata?.auction_budgets ?? {};
    const allRosterIds = Object.values(draft.slotToRosterId);
    const picksWonMap = await this.draftPicksRepository.countPicksWonByRosters(draft.id, allRosterIds, client);
    const maxPlayers = getMaxPlayersPerTeam(draft);

    for (const [slotStr, rosterId] of Object.entries(draft.slotToRosterId)) {
      const userId = findUserBySlot(draft.draftOrder, Number(slotStr));
      if (!userId || userId === excludeUserId) continue;

      const picksWon = picksWonMap.get(rosterId) ?? 0;
      if (picksWon >= maxPlayers) continue;

      if (!(String(rosterId) in budgets)) continue;
      const budget = budgets[String(rosterId)];
      const remainingSlots = maxPlayers - picksWon;
      const reserveNeeded = Math.max(0, remainingSlots - 1);
      if (budget - reserveNeeded >= 1) {
        return { userId, rosterId };
      }
    }
    return null;
  }

}
