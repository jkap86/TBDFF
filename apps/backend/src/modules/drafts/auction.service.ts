import cron from 'node-cron';
import { DraftRepository } from './drafts.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { PlayerRepository } from '../players/players.repository';
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
import { config } from '../../config';
import { findUserBySlot, findRosterIdByUserId, getMaxPlayersPerTeam } from './draft-helpers';

/**
 * Manages auction draft logic: nominations, bidding, auto-bids, and resolution.
 *
 * **Single-instance limitation:** In-memory timers (pendingAutoBidTimeouts, autoBidLocks)
 * only exist on the current process. If multiple backend instances run concurrently,
 * each maintains its own timers independently — only one instance should run auction
 * drafts at a time. TODO: For multi-instance support, move timer coordination to
 * a shared store (e.g. Redis pub/sub or pg_notify).
 *
 * **Recovery:** On startup, `recoverActiveAuctions()` re-schedules auto-bid timers for
 * any in-progress nominations, and a 30-second cron job catches any that slip through.
 */
export class AuctionService {
  /** Per-draft lock to prevent concurrent processAutoBids executions */
  private autoBidLocks = new Map<string, Promise<Draft | null>>();
  /** Pending setTimeout handles for scheduleAutoBids, keyed by draftId */
  private pendingAutoBidTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
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

  /**
   * Reschedule auto-bids for any active auction drafts that have an unresolved
   * nomination. Called on startup to recover state lost when the process restarted.
   */
  async recoverActiveAuctions(): Promise<void> {
    if (!config.ENABLE_DRAFT_RECOVERY) {
      console.log('[AuctionService] Draft recovery disabled via ENABLE_DRAFT_RECOVERY');
      return;
    }
    try {
      const drafts = await this.draftRepository.findActiveDraftingAuctions();
      for (const draft of drafts) {
        if (draft.metadata?.current_nomination) {
          console.log(`[AuctionService] Recovering nomination timer for draft ${draft.id}, pick ${draft.metadata.current_nomination.pick_id}`);
          this.scheduleAutoBids(draft.id);
        }
      }
    } catch (err) {
      console.error('[AuctionService] recoverActiveAuctions failed:', err);
    }
    this.startRecoveryJob();
  }

  /**
   * Cron job that runs every 30 seconds to catch any active auction nominations
   * whose auto-bid timeout was lost (e.g. after a partial restart or edge case).
   */
  private startRecoveryJob(): void {
    cron.schedule('*/30 * * * * *', async () => {
      try {
        const drafts = await this.draftRepository.findActiveDraftingAuctions();
        for (const draft of drafts) {
          if (
            draft.metadata?.current_nomination &&
            !this.pendingAutoBidTimeouts.has(draft.id) &&
            !this.autoBidLocks.has(draft.id)
          ) {
            this.scheduleAutoBids(draft.id);
          }
        }
      } catch (err) {
        console.error('[AuctionService] recovery cron failed:', err);
      }
    });
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

    this.scheduleAutoBids(draftId);
    this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated });
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

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
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

    this.scheduleAutoBids(draftId);
    this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated });
    return { draft: updated };
  }

  async resolveNomination(
    draftId: string,
    userId: string,
  ): Promise<{ draft: Draft; won?: DraftPick }> {
    // Pre-checks outside transaction
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
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
      const winnerPicksWon = await this.draftRepository.countPicksWonByRoster(
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
      const resolvedPick = await this.draftRepository.makeAuctionPick(
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
      const afterDeduct = await this.draftRepository.deductBudget(
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
      const completed = await this.draftRepository.completeAndUpdateLeagueInTx(
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
      this.cancelScheduledAutoBids(draftId);
    }

    if (pick) {
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: resultDraft, pick });

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

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
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

      let nextPick = await this.draftRepository.findNextPick(draftId, client);
      if (!nextPick) throw new ValidationException('All nominations complete');

      // Enable auto-pick for the timed-out nominator (the original slot owner who missed their turn)
      const originalSlotOwner = findUserBySlot(freshDraft.draftOrder, nextPick.draftSlot);
      if (originalSlotOwner) {
        const addResult = await this.draftRepository.addAutoPickUser(draftId, originalSlotOwner, client);
        if (addResult) freshDraft = addResult;
      }

      // Forfeit nomination slots for full-roster teams until an eligible nominator is found
      let nominatorRosterId = freshDraft.slotToRosterId[String(nextPick.draftSlot)];
      let nominatorPicksWon = await this.draftRepository.countPicksWonByRoster(
        draftId, nominatorRosterId, client,
      );

      while (nominatorPicksWon >= getMaxPlayersPerTeam(freshDraft)) {
        await this.draftRepository.forfeitPick(nextPick.id, client);

        nextPick = await this.draftRepository.findNextPick(draftId, client);
        if (!nextPick) {
          // All remaining nomination slots forfeited — complete the draft
          const completed = await this.draftRepository.completeAndUpdateLeagueInTx(
            client, draftId, freshDraft.leagueId,
          );
          if (completed) {
            this.cancelScheduledAutoBids(draftId);
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
        nominatorPicksWon = await this.draftRepository.countPicksWonByRoster(
          draftId, nominatorRosterId, client,
        );
      }

      const slotOwner = findUserBySlot(freshDraft.draftOrder, nextPick.draftSlot);

      // Try the eligible nominator's queue first, fall back to best available
      const queuedPlayer = slotOwner
        ? await this.draftRepository.findFirstAvailableFromQueue(draftId, slotOwner, client)
        : null;
      const bestPlayer = queuedPlayer ?? (await this.draftRepository.findBestAvailable(draftId, client));
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

    this.scheduleAutoBids(draftId);
    this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated });
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

      const nextPick = await this.draftRepository.findNextPick(draftId, client);
      if (!nextPick) return null;

      const autoPickUsers: string[] = freshDraft.metadata?.auto_pick_users ?? [];
      const slotOwner = findUserBySlot(freshDraft.draftOrder, nextPick.draftSlot);

      if (!slotOwner || !autoPickUsers.includes(slotOwner)) return null;

      const queuedPlayer = await this.draftRepository.findFirstAvailableFromQueue(
        draftId, slotOwner, client,
      );
      const bestPlayer = queuedPlayer ?? (await this.draftRepository.findBestAvailable(draftId, client));
      if (!bestPlayer) return null;

      const nominatorRosterId = freshDraft.slotToRosterId[String(nextPick.draftSlot)];

      // If nominator's roster is full, skip auto-nominate — the offering timer will
      // expire and resolveNomination will advance to the next pick slot naturally.
      const nominatorPicksWon = await this.draftRepository.countPicksWonByRoster(
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
      this.scheduleAutoBids(draftId);
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated });
    }
  }

  private async validateBudget(
    draft: Draft,
    rosterId: number,
    bidAmount: number,
    client?: import('pg').PoolClient,
  ): Promise<void> {
    const budgets: Record<string, number> = draft.metadata?.auction_budgets ?? {};
    const currentBudget = budgets[String(rosterId)] ?? 0;

    const picksWon = await this.draftRepository.countPicksWonByRoster(draft.id, rosterId, client);
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
    const picksWonMap = await this.draftRepository.countPicksWonByRosters(draft.id, allRosterIds, client);
    const maxPlayers = getMaxPlayersPerTeam(draft);

    for (const [slotStr, rosterId] of Object.entries(draft.slotToRosterId)) {
      const userId = findUserBySlot(draft.draftOrder, Number(slotStr));
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
   * Cancel any pending scheduleAutoBids timeout for this draft.
   * Called when a draft completes so the setTimeout never fires.
   */
  cancelScheduledAutoBids(draftId: string): void {
    const timeout = this.pendingAutoBidTimeouts.get(draftId);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingAutoBidTimeouts.delete(draftId);
    }
    this.autoBidLocks.delete(draftId);
  }

  /**
   * Schedule auto-bid processing with per-draft locking.
   * If a processAutoBids is already running for this draft, the new call
   * waits for it to finish then runs once more (coalescing multiple triggers).
   * Cancels any existing pending timeout before scheduling a new one.
   *
   * **Single-instance only:** The setTimeout handle lives in this process's memory.
   * If the process restarts, recoverActiveAuctions + the 30s cron job will
   * re-schedule any lost timers on the next tick.
   */
  scheduleAutoBids(draftId: string): void {
    const existingTimeout = this.pendingAutoBidTimeouts.get(draftId);
    if (existingTimeout) clearTimeout(existingTimeout);

    const timeout = setTimeout(() => {
      this.pendingAutoBidTimeouts.delete(draftId);
      const existing = this.autoBidLocks.get(draftId);
      const run = (existing ?? Promise.resolve(null))
        .then(() => this._processAutoBids(draftId))
        .then(async (result) => {
          if (!result) {
            // No auto-bid was placed — schedule a follow-up at the deadline
            // so _processAutoBids can auto-resolve the expired nomination (Fix A)
            const draft = await this.draftRepository.findById(draftId);
            const nom = draft?.metadata?.current_nomination;
            if (nom && draft?.status === 'drafting') {
              const msUntilDeadline = new Date(nom.bid_deadline).getTime() - Date.now();
              if (msUntilDeadline > 0) {
                const deadlineTimeout = setTimeout(() => {
                  this.pendingAutoBidTimeouts.delete(draftId);
                  this.scheduleAutoBids(draftId);
                }, msUntilDeadline + 1000);
                this.pendingAutoBidTimeouts.set(draftId, deadlineTimeout);
              } else {
                this.scheduleAutoBids(draftId);
              }
            }
          }
          return result;
        })
        .catch((err) => {
          console.error(`[AuctionService] processAutoBids failed for draft ${draftId}:`, err);
          return null;
        });
      this.autoBidLocks.set(draftId, run);
      run.finally(() => {
        if (this.autoBidLocks.get(draftId) === run) {
          this.autoBidLocks.delete(draftId);
        }
      });
    }, 3000);

    this.pendingAutoBidTimeouts.set(draftId, timeout);
  }

  /**
   * Process auto-bids after a nomination or manual bid.
   * Places an incremental bid (currentBid + 1) for the highest-target auto-bidder.
   * scheduleAutoBids() re-invokes this method after each bid, creating a natural
   * bidding war that continues until one auto-bidder is outmatched.
   */
  private async _processAutoBids(draftId: string): Promise<Draft | null> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft || draft.status !== 'drafting' || draft.type !== 'auction') return null;

    const nomination = draft.metadata?.current_nomination;
    if (!nomination) return null;

    // Auto-resolve expired nominations server-side (don't wait for client)
    const deadline = new Date(nomination.bid_deadline).getTime();
    if (Date.now() >= deadline) {
      const result = await this.resolveNomination(draftId, nomination.current_bidder);
      return result.draft;
    }

    const autoPickUsers: string[] = draft.metadata?.auto_pick_users ?? [];

    // Also include users who explicitly set a max_bid for this player (e.g. via "Auto-bid up to")
    const maxBidUserIds = await this.draftRepository.getUserIdsWithMaxBidForPlayer(
      draftId, nomination.player_id,
    );
    const candidateUserIds = [...new Set([...autoPickUsers, ...maxBidUserIds])];
    if (candidateUserIds.length === 0) return null;

    const player = await this.playerRepository.findById(nomination.player_id);
    if (!player) return null;

    // Use stored auction value, or compute on-the-fly from search_rank (same VBD formula as computeAuctionValues)
    const auctionValue =
      player.auctionValue ??
      (player.searchRank !== null
        ? Math.max(1, Math.round(55 * Math.exp(-0.022 * player.searchRank) + 0.5))
        : null) ??
      nomination.player_metadata?.auction_value ??
      null;
    if (auctionValue === null) return null;

    const draftBudget = draft.settings.budget;
    const currentBid: number = nomination.current_bid;
    const currentBidder: string = nomination.current_bidder;

    // Build list of ALL auto-bidders and their targets (including current bidder)
    // Batch-fetch queue items and roster pick counts to avoid N+2 queries per bidder
    const autoPickSet = new Set(autoPickUsers);
    const userRosterPairs: Array<{ userId: string; rosterId: number }> = [];
    for (const userId of candidateUserIds) {
      const rosterId = findRosterIdByUserId(draft, userId);
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
      // Auto-pick users fall back to 80% AAV default; max_bid-only users require an explicit max_bid
      const target =
        queueItem?.max_bid != null
          ? queueItem.max_bid
          : autoPickSet.has(userId)
            ? Math.floor(auctionValue * 0.8 * (draftBudget / 200) * (draft.settings.teams / 12))
            : 0;

      const budget = budgets[String(rosterId)] ?? 0;
      const picksWon = picksWonMap.get(rosterId) ?? 0;
      const totalSlots = getMaxPlayersPerTeam(draft);
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

    // Find the auto-bidder with the highest target to place the next incremental bid.
    allAutoTargets.sort((a, b) => {
      if (b.effectiveTarget !== a.effectiveTarget) return b.effectiveTarget - a.effectiveTarget;
      // Tie-break: current bidder ranks lower (they already lead; challengers need to act)
      if (a.userId === currentBidder) return 1;
      if (b.userId === currentBidder) return -1;
      return 0;
    });

    const topBidder = allAutoTargets[0];

    // If the highest auto-pick target belongs to the current bidder, they already win
    if (topBidder.userId === currentBidder) return null;

    // The top bidder must be able to beat the current bid
    if (topBidder.effectiveTarget <= currentBid) return null;

    const winner = topBidder;
    const winningBid = currentBid + 1;

    const newDeadline = new Date(Date.now() + draft.settings.nomination_timer * 1000).toISOString();

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

    // Re-read and write under advisory lock to prevent clobbering a concurrent manual bid
    const updated = await this.draftRepository.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [draftId]);

      const freshDraft = await this.draftRepository.findById(draftId, client);
      if (
        !freshDraft?.metadata?.current_nomination ||
        freshDraft.metadata.current_nomination.pick_id !== nomination.pick_id
      ) {
        return null;
      }

      // Bail out if a manual bid raised the price above our winning bid
      if (freshDraft.metadata.current_nomination.current_bid >= winningBid) {
        return null;
      }

      return this.draftRepository.update(draftId, {
        metadata: {
          ...freshDraft.metadata,
          current_nomination: {
            ...updatedNomination,
            // Use the freshest bid_history in case a manual bid landed between our read and lock
            bid_history: [
              ...freshDraft.metadata.current_nomination.bid_history,
              {
                user_id: winner.userId,
                amount: winningBid,
                timestamp: new Date().toISOString(),
                auto_bid: true,
              },
            ],
          },
        },
        lastPicked: new Date().toISOString(),
      }, client);
    });

    this.scheduleAutoBids(draftId);

    if (updated) {
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated });
    }

    return updated;
  }
}
