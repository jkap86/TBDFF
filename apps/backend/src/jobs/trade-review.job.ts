import cron, { ScheduledTask } from 'node-cron';
import { TradeService } from '../modules/trades/trades.service';

export class TradeReviewJob {
  private task: ScheduledTask | null = null;

  constructor(private readonly tradeService: TradeService) {}

  start(): void {
    // Run every minute
    this.task = cron.schedule('* * * * *', async () => {
      try {
        await this.tradeService.completeExpiredReviews();
      } catch (error) {
        console.error('[TradeReviewJob] Processing failed:', error);
      }
    });

    console.log('[TradeReviewJob] Scheduled to run every minute');
  }

  stop(): void {
    this.task?.stop();
  }

  async runNow(): Promise<void> {
    console.log('[TradeReviewJob] Manual processing triggered...');
    await this.tradeService.completeExpiredReviews();
    console.log('[TradeReviewJob] Manual processing complete');
  }
}
