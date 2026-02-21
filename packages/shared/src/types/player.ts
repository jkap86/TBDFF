export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | 'DL' | 'LB' | 'DB';
export type InjuryStatus = 'Out' | 'Doubtful' | 'Questionable' | 'Probable';

export interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  position: Position | null;
  fantasy_positions: string[];
  team: string | null;
  active: boolean;
  injury_status: InjuryStatus | null;
  years_exp: number | null;
  age: number | null;
  jersey_number: number | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerResponse {
  player: Player;
}

export interface PlayersListResponse {
  players: Player[];
}
