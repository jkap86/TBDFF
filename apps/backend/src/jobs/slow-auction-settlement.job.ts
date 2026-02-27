import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { SlowAuctionService } from '../modules/drafts/slow-auction.service';

/**
 * Background job that settles expired slow auction lots every 5 seconds.
 * Uses pg_try_advisory_lock for singleton execution across instances.
 */
export class SlowAuctionSettlementJob {
  private task: ScheduledTask | null = null;

  constructor(private readonly slowAuctionService: SlowAuctionService) {}

  start(): void {
    // Run every 5 seconds
    this.task = cron.schedule('*/5 * * * * *', async () => {
      try {
        const settled = await this.slowAuctionService.processExpiredLots();
        if (settled.length > 0) {
          console.log(`[SlowAuctionSettlementJob] Settled ${settled.length} lot(s)`);
        }
      } catch (err) {
        console.error('[SlowAuctionSettlementJob] Processing failed:', err);
      }
    });
    console.log('[SlowAuctionSettlementJob] Scheduled every 5 seconds');
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
  }
}
