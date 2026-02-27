import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { Pool } from 'pg';
import { SlowAuctionService } from '../modules/drafts/slow-auction.service';

const SETTLEMENT_LOCK_ID = 900000007;

/**
 * Background job that settles expired slow auction lots every 5 seconds.
 * Uses pg_try_advisory_lock for singleton execution across instances.
 */
export class SlowAuctionSettlementJob {
  private task: ScheduledTask | null = null;

  constructor(
    private readonly slowAuctionService: SlowAuctionService,
    private readonly pool: Pool,
  ) {}

  start(): void {
    // Run every 5 seconds
    this.task = cron.schedule('*/5 * * * * *', async () => {
      const client = await this.pool.connect();
      try {
        // Non-blocking singleton lock — skip if another instance holds it
        const { rows } = await client.query<{ acquired: boolean }>(
          'SELECT pg_try_advisory_lock($1) as acquired',
          [SETTLEMENT_LOCK_ID],
        );
        if (!rows[0].acquired) return;

        try {
          const settled = await this.slowAuctionService.processExpiredLots();
          if (settled.length > 0) {
            console.log(`[SlowAuctionSettlementJob] Settled ${settled.length} lot(s)`);
          }
        } finally {
          await client.query('SELECT pg_advisory_unlock($1)', [SETTLEMENT_LOCK_ID]);
        }
      } catch (err) {
        console.error('[SlowAuctionSettlementJob] Processing failed:', err);
      } finally {
        client.release();
      }
    });
    console.log('[SlowAuctionSettlementJob] Scheduled every 5 seconds');
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
  }
}
