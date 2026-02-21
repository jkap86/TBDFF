import cron from 'node-cron';
import { Pool } from 'pg';
import { PlayerRepository } from '../modules/players/players.repository';
import { PlayerService } from '../modules/players/players.service';
import { SleeperApiClient } from '../integrations/sleeper/sleeper-api-client';
import { SleeperPlayerProvider } from '../integrations/sleeper/sleeper-player-provider';

export class PlayerSyncJob {
  private readonly playerService: PlayerService;

  constructor(pool: Pool) {
    const playerRepository = new PlayerRepository(pool);
    const sleeperApi = new SleeperApiClient();
    const playerProvider = new SleeperPlayerProvider(sleeperApi);
    this.playerService = new PlayerService(playerRepository, playerProvider);
  }

  start(): void {
    // Run every 12 hours at :00 minutes
    cron.schedule('0 */12 * * *', async () => {
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
