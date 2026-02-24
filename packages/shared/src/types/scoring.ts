export interface NflStateResponse {
  season: string;
  week: number;
  seasonType: string;
}

export interface LeaguePlayerScore {
  player_id: string;
  stats: Record<string, number>;
  fantasy_points: number;
}

export interface LeagueScoresResponse {
  scores: LeaguePlayerScore[];
}

export interface LeaguePlayerProjection {
  player_id: string;
  projections: Record<string, number>;
  projected_points: number;
}

export interface LeagueProjectionsResponse {
  projections: LeaguePlayerProjection[];
}

export interface GameInfo {
  gameId: string;
  status: string;
  startTime: string | null;
  metadata: Record<string, any>;
}

export interface GameScheduleResponse {
  games: GameInfo[];
}

export type PlayerGameStatus = 'pre_game' | 'in_game' | 'complete';

export interface LivePlayerScore {
  player_id: string;
  roster_id: number;
  full_name: string;
  position: string | null;
  team: string | null;
  game_status: PlayerGameStatus;
  actual_points: number;
  projected_points: number;
  live_total: number;
}

export interface LiveRosterScore {
  roster_id: number;
  owner_id: string | null;
  live_total: number;
  actual_total: number;
  projected_total: number;
}

export interface LiveScoresResponse {
  players: LivePlayerScore[];
  rosters: LiveRosterScore[];
}
