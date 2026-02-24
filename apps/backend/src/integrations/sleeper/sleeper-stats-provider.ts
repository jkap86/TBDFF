import {
  StatsDataProvider,
  WeeklyStatData,
  GameData,
  NflState,
} from '../shared/stats-data-provider.interface';
import { SleeperApiClient } from './sleeper-api-client';

export class SleeperStatsProvider implements StatsDataProvider {
  readonly providerName = 'sleeper';

  constructor(private readonly sleeperApi: SleeperApiClient) {}

  async fetchWeeklyStats(
    season: string,
    week: number,
    seasonType: string,
  ): Promise<WeeklyStatData[]> {
    const raw = await this.sleeperApi.fetchWeeklyStats(season, week, seasonType);
    return Object.entries(raw).map(([playerId, stats]) => ({
      externalPlayerId: playerId,
      stats,
    }));
  }

  async fetchWeeklyProjections(
    season: string,
    week: number,
    seasonType: string,
  ): Promise<WeeklyStatData[]> {
    const raw = await this.sleeperApi.fetchWeeklyProjections(season, week, seasonType);
    return Object.entries(raw).map(([playerId, projections]) => ({
      externalPlayerId: playerId,
      stats: projections,
    }));
  }

  async fetchGameSchedule(
    season: string,
    week: number,
    seasonType: string,
  ): Promise<GameData[]> {
    const raw = await this.sleeperApi.fetchGameSchedule(season, week, seasonType);
    return raw.map((game) => ({
      gameId: game.game_id,
      status: game.status,
      startTime: game.start_time || null,
      metadata: game.metadata || {},
    }));
  }

  async fetchNflState(): Promise<NflState> {
    const state = await this.sleeperApi.fetchNflState();
    return {
      season: state.season,
      week: state.week,
      seasonType: state.season_type,
      displayWeek: state.display_week,
    };
  }
}
