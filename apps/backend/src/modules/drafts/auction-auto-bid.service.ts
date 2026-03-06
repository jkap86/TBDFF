import { DraftRepository } from './drafts.repository';
import { DraftPicksRepository } from './draft-picks.repository';
import { DraftTimerRepository } from './draft-timer.repository';
import { DraftQueueRepository } from './draft-queue.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { PlayerRepository } from '../players/players.repository';
import { DraftGateway } from './draft.gateway';
import { Draft } from './drafts.model';
import { findRosterIdByUserId, getMaxPlayersPerTeam } from './draft-helpers';

/**
 * Manages auction auto-bid scheduling and bidding war orchestration.
 *
 * Timer coordination uses a Postgres `auction_timers` table instead of
 * in-memory setTimeouts. Any instance can claim and process timers via
 * the AuctionTimerJob (1-second poll with FOR UPDATE SKIP LOCKED).
 */
export class AuctionAutoBidService {
  private draftGateway?: DraftGateway;

  /** Callback to resolve expired nominations (wired to AuctionService.resolveNomination) */
  private onDeadlineExpired?: (draftId: string, userId: string) => Promise<{ draft: Draft }>;

  constructor(
    private readonly draftRepository: DraftRepository,
    private readonly draftTimerRepository: DraftTimerRepository,
    private readonly draftQueueRepository: DraftQueueRepository,
    private readonly draftPicksRepository: DraftPicksRepository,
    private readonly leagueRepository: LeagueRepository,
    private readonly playerRepository: PlayerRepository,
  ) {}

  setGateway(gateway: DraftGateway): void {
    this.draftGateway = gateway;
  }

  /** Register a callback for when a nomination deadline expires during auto-bid processing */
  setOnDeadlineExpired(callback: (draftId: string, userId: string) => Promise<{ draft: Draft }>): void {
    this.onDeadlineExpired = callback;
  }

  /**
   * Cancel any pending auction timers for this draft.
   * Called when a draft completes.
   */
  async cancelScheduledAutoBids(draftId: string): Promise<void> {
    await this.draftTimerRepository.cancelAuctionTimers(draftId);
  }

  /**
   * Schedule auto-bid processing by upserting a row into auction_timers.
   * The AuctionTimerJob polls for runnable timers every 1 second and calls
   * processAutoBidsFromTimer when a timer fires.
   *
   * Multi-instance safe: the partial unique index ensures only one pending
   * timer per draft, and INSERT ON CONFLICT replaces any existing timer.
   */
  async scheduleAutoBids(draftId: string, delayMs = 3000): Promise<void> {
    const runAt = new Date(Date.now() + delayMs);
    const timerType = delayMs <= 3000 ? 'auto_bid' : 'deadline';
    await this.draftTimerRepository.upsertAuctionTimer(draftId, timerType, runAt);
  }

  /**
   * Called by AuctionTimerJob when a timer fires.
   * Processes auto-bids and schedules follow-up timers as needed.
   */
  async processAutoBidsFromTimer(draftId: string): Promise<void> {
    try {
      const result = await this._processAutoBids(draftId);
      if (!result) {
        // No auto-bid was placed — schedule a follow-up at the deadline
        // so _processAutoBids can auto-resolve the expired nomination
        const draft = await this.draftRepository.findById(draftId);
        const nom = draft?.metadata?.current_nomination;
        if (nom && draft?.status === 'drafting') {
          const msUntilDeadline = new Date(nom.bid_deadline).getTime() - Date.now();
          if (msUntilDeadline > 0) {
            await this.scheduleAutoBids(draftId, msUntilDeadline + 1000);
          } else {
            await this.scheduleAutoBids(draftId, 0);
          }
        }
      }
    } catch (err) {
      console.error(`[AuctionAutoBidService] processAutoBidsFromTimer failed for draft ${draftId}:`, err);
    }
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
      const result = await this.onDeadlineExpired?.(draftId, nomination.current_bidder);
      return result?.draft ?? null;
    }

    const autoPickUsers: string[] = draft.metadata?.auto_pick_users ?? [];

    // Also include users who explicitly set a max_bid for this player (e.g. via "Auto-bid up to")
    const maxBidUserIds = await this.draftQueueRepository.getUserIdsWithMaxBidForPlayer(
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
      this.draftQueueRepository.getQueueItemsForPlayerByUsers(
        draftId,
        userRosterPairs.map((p) => p.userId),
        nomination.player_id,
      ),
      this.draftPicksRepository.countPicksWonByRosters(
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

      if (!(String(rosterId) in budgets)) continue;
      const budget = budgets[String(rosterId)];
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

    // Find the challenger: highest-target bidder who is NOT the current bidder.
    // The old logic returned null when the top bidder was the current bidder,
    // which stopped the war prematurely — other auto-bidders never got to counter.
    const challenger = allAutoTargets.find((b) => b.userId !== currentBidder);
    if (!challenger || challenger.effectiveTarget <= currentBid) return null;

    const winner = challenger;
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

    await this.scheduleAutoBids(draftId);

    if (updated) {
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated, server_time: new Date().toISOString() });
    }

    return updated;
  }
}
