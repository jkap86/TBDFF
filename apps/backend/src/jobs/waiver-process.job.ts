import cron, { ScheduledTask } from 'node-cron';
import { TransactionService } from '../modules/transactions/transactions.service';

export class WaiverProcessJob {
  private task: ScheduledTask | null = null;

  constructor(private readonly transactionService: TransactionService) {}

  start(): void {
    // Run every 5 minutes
    this.task = cron.schedule('*/5 * * * *', async () => {
      try {
        await this.transactionService.processAllPendingWaivers();
      } catch (error) {
        console.error('[WaiverProcessJob] Processing failed:', error);
      }
    });

    console.log('[WaiverProcessJob] Scheduled to run every 5 minutes');
  }

  stop(): void {
    this.task?.stop();
  }

  async runNow(): Promise<void> {
    console.log('[WaiverProcessJob] Manual processing triggered...');
    await this.transactionService.processAllPendingWaivers();
    console.log('[WaiverProcessJob] Manual processing complete');
  }
}
