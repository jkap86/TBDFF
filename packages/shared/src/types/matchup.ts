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

// Matchup Derby types
export interface MatchupDerbyOrderEntry {
  user_id: string;
  roster_id: number;
  username: string;
}

export interface MatchupDerbyPick {
  user_id: string;
  picker_roster_id: number;
  opponent_roster_id: number;
  week: number;
  picked_at: string;
}

export interface MatchupDerbyState {
  id: string;
  league_id: string;
  status: 'pending' | 'active' | 'complete';
  derby_order: MatchupDerbyOrderEntry[];
  picks: MatchupDerbyPick[];
  current_pick_index: number;
  total_picks: number;
  pick_timer: number;
  pick_deadline: string | null;
  timeout_action: number;
  skipped_users: string[];
  started_at: string | null;
  completed_at: string | null;
}

export interface MatchupDerbyPickRequest {
  opponent_roster_id: number;
  week: number;
}

export interface MatchupDerbyResponse {
  derby: MatchupDerbyState;
  server_time: string;
}
