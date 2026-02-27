import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { randomUUID } from 'crypto';
import { AuctionService } from '../modules/drafts/auction.service';
import { DraftRepository } from '../modules/drafts/drafts.repository';

/**
 * Polls `auction_timers` every 1 second and processes runnable timers.
 * Uses FOR UPDATE SKIP LOCKED so multiple instances never claim the same timer.
 *
 * A 30-second recovery sweep ensures timers are created for active drafts
 * that somehow lost their timer row (e.g. crash before upsert completed).
 */
export class AuctionTimerJob {
  private pollTask: ScheduledTask | null = null;
  private recoveryTask: ScheduledTask | null = null;
  private readonly instanceId: string;

  constructor(
    private readonly auctionService: AuctionService,
    private readonly draftRepository: DraftRepository,
  ) {
    this.instanceId = randomUUID();
  }

  start(): void {
    // Poll every 1 second for runnable timers
    this.pollTask = cron.schedule('*/1 * * * * *', () => { this.poll(); });

    // Every 30 seconds: recover missing timers + reset stale claims
    this.recoveryTask = cron.schedule('*/30 * * * * *', () => { this.recover(); });

    console.log(`[AuctionTimerJob] Started (instance ${this.instanceId.slice(0, 8)})`);
  }

  private async poll(): Promise<void> {
    try {
      const timers = await this.draftRepository.claimRunnableTimers(this.instanceId, 5);

      for (const timer of timers) {
        try {
          await this.auctionService.processAutoBidsFromTimer(timer.draft_id);
        } catch (err) {
          console.error(`[AuctionTimerJob] Failed for draft ${timer.draft_id}:`, err);
        } finally {
          await this.draftRepository.deleteAuctionTimer(timer.id);
        }
      }
    } catch (err) {
      console.error('[AuctionTimerJob] Poll failed:', err);
    }
  }

  private async recover(): Promise<void> {
    try {
      // Reset timers claimed > 30s ago (instance probably crashed mid-processing)
      const reset = await this.draftRepository.resetStaleClaims(30);
      if (reset > 0) {
        console.log(`[AuctionTimerJob] Reset ${reset} stale timer claim(s)`);
      }

      // Ensure active drafts with nominations have a timer row
      const drafts = await this.draftRepository.findActiveDraftingAuctions();
      for (const draft of drafts) {
        if (draft.metadata?.current_nomination) {
          const hasTimer = await this.draftRepository.hasAuctionTimer(draft.id);
          if (!hasTimer) {
            console.log(`[AuctionTimerJob] Recovering missing timer for draft ${draft.id}`);
            const nom = draft.metadata.current_nomination;
            const msUntilDeadline = new Date(nom.bid_deadline).getTime() - Date.now();
            const delay = msUntilDeadline > 3000 ? 3000 : Math.max(0, msUntilDeadline);
            await this.draftRepository.upsertAuctionTimer(
              draft.id,
              delay <= 3000 ? 'auto_bid' : 'deadline',
              new Date(Date.now() + delay),
            );
          }
        }
      }
    } catch (err) {
      console.error('[AuctionTimerJob] Recovery failed:', err);
    }
  }

  stop(): void {
    this.pollTask?.stop();
    this.recoveryTask?.stop();
    this.pollTask = null;
    this.recoveryTask = null;
  }
}
