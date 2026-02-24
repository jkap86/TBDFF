import cron from 'node-cron';
import { ScoringService } from '../modules/scoring/scoring.service';

export class StatsSyncJob {
  constructor(private readonly scoringService: ScoringService) {}

  start(): void {
    // Stats: every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        const state = await this.scoringService.getNflState();
        if (state.seasonType === 'off') return;

        const result = await this.scoringService.syncWeeklyStats(
          state.season,
          state.week,
          state.seasonType,
        );
        if (result.synced > 0) {
          console.log(
            `[StatsSyncJob] Stats sync: ${result.synced} synced, ${result.skipped} skipped`,
          );
        }
      } catch (error) {
        console.error('[StatsSyncJob] Stats sync failed:', error);
      }
    });

    // Projections: once daily at 6 AM
    cron.schedule('0 6 * * *', async () => {
      console.log('[StatsSyncJob] Starting daily projections sync...');
      try {
        const state = await this.scoringService.getNflState();
        if (state.seasonType === 'off') return;

        const result = await this.scoringService.syncWeeklyProjections(
          state.season,
          state.week,
          state.seasonType,
        );
        console.log(
          `[StatsSyncJob] Projections sync: ${result.synced} synced, ${result.skipped} skipped`,
        );
      } catch (error) {
        console.error('[StatsSyncJob] Projections sync failed:', error);
      }
    });

    console.log('[StatsSyncJob] Scheduled: stats every 5min, projections daily@6AM');
  }

  // Manual trigger for testing
  async syncNow(
    season?: string,
    week?: number,
    seasonType?: string,
  ): Promise<{
    stats: { synced: number; skipped: number };
    projections: { synced: number; skipped: number };
  }> {
    const state = await this.scoringService.getNflState();
    const s = season || state.season;
    const w = week || state.week;
    const st = seasonType || state.seasonType;

    console.log(`[StatsSyncJob] Manual sync: ${s} week ${w} (${st})`);

    const [stats, projections] = await Promise.all([
      this.scoringService.syncWeeklyStats(s, w, st),
      this.scoringService.syncWeeklyProjections(s, w, st),
    ]);

    console.log(
      `[StatsSyncJob] Manual sync complete: stats ${stats.synced}/${stats.skipped}, projections ${projections.synced}/${projections.skipped}`,
    );

    return { stats, projections };
  }
}
