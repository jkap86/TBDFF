export interface WeeklyStatData {
  externalPlayerId: string;
  stats: Record<string, number>;
}

export interface GameData {
  gameId: string;
  status: string;
  startTime: string | null;
  metadata: Record<string, any>;
}

export interface NflState {
  season: string;
  week: number;
  seasonType: string;
  displayWeek: number;
}

export interface StatsDataProvider {
  readonly providerName: string;

  fetchWeeklyStats(season: string, week: number, seasonType: string): Promise<WeeklyStatData[]>;
  fetchWeeklyProjections(season: string, week: number, seasonType: string): Promise<WeeklyStatData[]>;
  fetchGameSchedule(season: string, week: number, seasonType: string): Promise<GameData[]>;
  fetchNflState(): Promise<NflState>;
}
