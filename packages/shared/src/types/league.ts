// League settings interface (Sleeper-compatible, all integer values)
export interface LeagueSettings {
  num_teams: number;
  bench_lock: number;
  capacity_override: number;
  commissioner_direct_invite: number;
  daily_waivers: number;
  daily_waivers_hour: number;
  disable_adds: number;
  draft_rounds: number;
  league_average_match: number;
  leg: number;
  max_keepers: number;
  offseason_adds: number;
  pick_trading: number;
  playoff_round_type: number;
  playoff_seed_type: number;
  playoff_teams: number;
  playoff_type: number;
  playoff_week_start: number;
  reserve_allow_cov: number;
  reserve_allow_dnr: number;
  reserve_allow_doubtful: number;
  reserve_allow_na: number;
  reserve_allow_out: number;
  reserve_allow_sus: number;
  reserve_slots: number;
  taxi_allow_vets: number;
  taxi_deadline: number;
  taxi_slots: number;
  taxi_years: number;
  trade_deadline: number;
  trade_review_days: number;
  type: number; // 0=redraft, 1=keeper, 2=dynasty
  best_ball: number; // 0=off, 1=on
  waiver_bid_min: number;
  waiver_budget: number;
  waiver_clear_days: number;
  waiver_day_of_week: number;
  waiver_type: number;
  [key: string]: number; // Allow additional keys for extensibility
}

// League scoring settings interface (Sleeper-compatible, all float values)
export interface LeagueScoringSettings {
  // Passing
  pass_td: number;
  pass_yd: number;
  pass_int: number;
  pass_2pt: number;
  pass_att: number;
  pass_cmp: number;
  pass_inc: number;
  pass_sack: number;
  // Rushing
  rush_td: number;
  rush_yd: number;
  rush_att: number;
  rush_2pt: number;
  // Receiving
  rec: number;
  rec_td: number;
  rec_yd: number;
  rec_2pt: number;
  // Fumbles
  fum: number;
  fum_lost: number;
  fum_rec_td: number;
  // Kicking
  fgm_0_19: number;
  fgm_20_29: number;
  fgm_30_39: number;
  fgm_40_49: number;
  fgm_50p: number;
  fgmiss: number;
  xpm: number;
  xpmiss: number;
  // Defense
  sack: number;
  int: number;
  ff: number;
  fum_rec: number;
  def_td: number;
  safe: number;
  blk_kick: number;
  pts_allow_0: number;
  pts_allow_1_6: number;
  pts_allow_7_13: number;
  pts_allow_14_20: number;
  pts_allow_21_27: number;
  pts_allow_28_34: number;
  pts_allow_35p: number;
  // Special teams
  st_td: number;
  st_ff: number;
  st_fum_rec: number;
  def_st_td: number;
  def_st_ff: number;
  def_st_fum_rec: number;
  // Allow additional keys for extensibility
  [key: string]: number;
}

// Roster position type
export type RosterPosition =
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'K'
  | 'DEF'
  | 'FLEX'
  | 'SUPER_FLEX'
  | 'REC_FLEX'
  | 'WRRB_FLEX'
  | 'BN'
  | 'IR';

// League status / season type
export type LeagueStatus = 'pre_draft' | 'drafting' | 'in_season' | 'complete';
export type SeasonType = 'regular' | 'pre' | 'post';
export type LeagueType = 0 | 1 | 2; // 0=redraft, 1=keeper, 2=dynasty

// League entity
export interface League {
  id: string;
  name: string;
  sport: string;
  season: string;
  season_type: SeasonType;
  status: LeagueStatus;
  total_rosters: number;
  avatar: string | null;
  draft_id: string | null;
  previous_league_id: string | null;
  settings: LeagueSettings;
  scoring_settings: LeagueScoringSettings;
  roster_positions: RosterPosition[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

// League member
export type MemberRole = 'commissioner' | 'member' | 'spectator';

export interface LeagueMember {
  id: string;
  league_id: string;
  user_id: string;
  role: MemberRole;
  display_name: string | null;
  username: string; // joined from users table
  joined_at: string;
}

// API request/response types
export interface CreateLeagueRequest {
  name: string;
  sport?: string;
  season: string;
  total_rosters?: number;
  settings?: Partial<LeagueSettings>;
  scoring_settings?: Partial<LeagueScoringSettings>;
  roster_positions?: RosterPosition[];
}

export interface UpdateLeagueRequest {
  name?: string;
  season_type?: SeasonType;
  status?: LeagueStatus;
  total_rosters?: number;
  avatar?: string | null;
  settings?: Partial<LeagueSettings>;
  scoring_settings?: Partial<LeagueScoringSettings>;
  roster_positions?: RosterPosition[];
}

export interface LeagueResponse {
  league: League;
}

export interface LeagueListResponse {
  leagues: League[];
}

export interface LeagueMembersResponse {
  members: LeagueMember[];
}

export interface LeagueMemberResponse {
  member: LeagueMember;
}

// League invite
export interface LeagueInvite {
  id: string;
  league_id: string;
  inviter_id: string;
  invitee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  inviter_username: string;
  invitee_username: string;
  league_name: string;
  created_at: string;
  updated_at: string;
}

// Public league (limited data exposed)
export interface PublicLeague {
  id: string;
  name: string;
  sport: string;
  season: string;
  status: LeagueStatus;
  total_rosters: number;
  avatar: string | null;
  settings: Partial<LeagueSettings>;
  roster_positions: RosterPosition[];
  member_count: number;
}

// Invite request/response types
export interface CreateInviteRequest {
  username: string;
}

export interface InviteResponse {
  invite: LeagueInvite;
}

export interface InviteListResponse {
  invites: LeagueInvite[];
}

// Roster types (Sleeper-compatible)
export interface RosterSettings {
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  waiver_position: number;
  [key: string]: number;
}

export interface Roster {
  id: string;
  roster_id: number;
  league_id: string;
  owner_id: string | null;
  players: string[];
  starters: string[];
  reserve: string[];
  taxi: string[];
  settings: RosterSettings;
  metadata: Record<string, any>;
  waiver_budget: number;
  created_at: string;
  updated_at: string;
}

export interface RosterResponse {
  roster: Roster;
}

export interface RosterListResponse {
  rosters: Roster[];
}

// Public leagues response
export interface PublicLeaguesResponse {
  leagues: PublicLeague[];
  total: number;
  limit: number;
  offset: number;
}
