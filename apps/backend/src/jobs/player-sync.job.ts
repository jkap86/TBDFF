import cron, { ScheduledTask } from 'node-cron';
import { PlayerService } from '../modules/players/players.service';

export class PlayerSyncJob {
  private task: ScheduledTask | null = null;

  constructor(private readonly playerService: PlayerService) {}

  start(): void {
    // Run every 12 hours at :00 minutes
    this.task = cron.schedule('0 */12 * * *', async () => {
      console.log('[PlayerSyncJob] Starting player sync...');
      try {
        const result = await this.playerService.syncPlayersFromProvider();
        console.log(
          `[PlayerSyncJob] Sync complete: ${result.created} created, ${result.updated} updated`
        );
      } catch (error) {
        console.error('[PlayerSyncJob] Sync failed:', error);
      }
    });

    console.log('[PlayerSyncJob] Scheduled to run every 12 hours');
  }

  stop(): void {
    this.task?.stop();
  }

  // Manual trigger (for testing or admin endpoint)
  async runNow(): Promise<{ created: number; updated: number }> {
    console.log('[PlayerSyncJob] Manual sync triggered...');
    const result = await this.playerService.syncPlayersFromProvider();
    console.log(
      `[PlayerSyncJob] Manual sync complete: ${result.created} created, ${result.updated} updated`
    );
    return result;
  }
}
