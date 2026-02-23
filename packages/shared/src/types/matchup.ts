export interface Matchup {
  id: string;
  league_id: string;
  week: number;
  matchup_id: number;
  roster_id: number;
  points: number;
  created_at: string;
  updated_at: string;
}

export interface MatchupListResponse {
  matchups: Matchup[];
}
