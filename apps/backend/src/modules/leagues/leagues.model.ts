// League settings interface (Sleeper-compatible)
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
  waiver_bid_min: number;
  waiver_budget: number;
  waiver_clear_days: number;
  waiver_day_of_week: number;
  waiver_type: number;
  member_can_invite: number; // 0 = commissioner only, 1 = all members can invite
  public: number; // 0 = private, 1 = public
}

// League scoring settings interface (Sleeper-compatible)
export interface LeagueScoringSettings {
  pass_td: number;
  pass_yd: number;
  pass_int: number;
  pass_2pt: number;
  pass_att: number;
  pass_cmp: number;
  pass_inc: number;
  pass_sack: number;
  rush_td: number;
  rush_yd: number;
  rush_att: number;
  rush_2pt: number;
  rec: number;
  rec_td: number;
  rec_yd: number;
  rec_2pt: number;
  fum: number;
  fum_lost: number;
  fum_rec_td: number;
  fgm_0_19: number;
  fgm_20_29: number;
  fgm_30_39: number;
  fgm_40_49: number;
  fgm_50p: number;
  fgmiss: number;
  xpm: number;
  xpmiss: number;
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
  st_td: number;
  st_ff: number;
  st_fum_rec: number;
  def_st_td: number;
  def_st_ff: number;
  def_st_fum_rec: number;
  [key: string]: number; // Allow additional keys
}

export type RosterPosition =
  | 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF'
  | 'FLEX' | 'SUPER_FLEX' | 'REC_FLEX' | 'WRRB_FLEX'
  | 'BN' | 'IR';

export type LeagueStatus = 'pre_draft' | 'drafting' | 'in_season' | 'complete';
export type SeasonType = 'regular' | 'pre' | 'post';

// Default settings for a 12-team PPR redraft league (Sleeper defaults)
export const DEFAULT_SETTINGS: LeagueSettings = {
  num_teams: 12,
  bench_lock: 0,
  capacity_override: 0,
  commissioner_direct_invite: 0,
  daily_waivers: 0,
  daily_waivers_hour: 11,
  disable_adds: 0,
  draft_rounds: 15,
  league_average_match: 0,
  leg: 1,
  max_keepers: 0,
  offseason_adds: 0,
  pick_trading: 0,
  playoff_round_type: 0,
  playoff_seed_type: 0,
  playoff_teams: 6,
  playoff_type: 0,
  playoff_week_start: 15,
  reserve_allow_cov: 1,
  reserve_allow_dnr: 0,
  reserve_allow_doubtful: 0,
  reserve_allow_na: 0,
  reserve_allow_out: 0,
  reserve_allow_sus: 0,
  reserve_slots: 1,
  taxi_allow_vets: 0,
  taxi_deadline: 0,
  taxi_slots: 0,
  taxi_years: 0,
  trade_deadline: 11,
  trade_review_days: 2,
  type: 0,
  waiver_bid_min: 0,
  waiver_budget: 100,
  waiver_clear_days: 2,
  waiver_day_of_week: 2,
  waiver_type: 0,
  member_can_invite: 0, // Default: only commissioner can invite
  public: 0, // Default: private league
};

// Default PPR scoring settings
export const DEFAULT_SCORING: LeagueScoringSettings = {
  pass_td: 4,
  pass_yd: 0.04,
  pass_int: -2,
  pass_2pt: 2,
  pass_att: 0,
  pass_cmp: 0,
  pass_inc: 0,
  pass_sack: 0,
  rush_td: 6,
  rush_yd: 0.1,
  rush_att: 0,
  rush_2pt: 2,
  rec: 1,
  rec_td: 6,
  rec_yd: 0.1,
  rec_2pt: 2,
  fum: 0,
  fum_lost: -2,
  fum_rec_td: 6,
  fgm_0_19: 3,
  fgm_20_29: 3,
  fgm_30_39: 3,
  fgm_40_49: 4,
  fgm_50p: 5,
  fgmiss: -1,
  xpm: 1,
  xpmiss: -1,
  sack: 1,
  int: 2,
  ff: 1,
  fum_rec: 1,
  def_td: 6,
  safe: 2,
  blk_kick: 2,
  pts_allow_0: 10,
  pts_allow_1_6: 7,
  pts_allow_7_13: 4,
  pts_allow_14_20: 1,
  pts_allow_21_27: 0,
  pts_allow_28_34: -1,
  pts_allow_35p: -4,
  st_td: 6,
  st_ff: 0,
  st_fum_rec: 0,
  def_st_td: 6,
  def_st_ff: 0,
  def_st_fum_rec: 0,
};

export const DEFAULT_ROSTER_POSITIONS: RosterPosition[] = [
  'QB', 'RB', 'RB', 'WR', 'WR', 'TE',
  'FLEX', 'FLEX', 'SUPER_FLEX',
  'K', 'DEF',
  'BN', 'BN', 'BN', 'BN', 'BN',
  'IR',
];

export class League {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly sport: string,
    public readonly season: string,
    public readonly seasonType: SeasonType,
    public readonly status: LeagueStatus,
    public readonly totalRosters: number,
    public readonly avatar: string | null,
    public readonly draftId: string | null,
    public readonly previousLeagueId: string | null,
    public readonly settings: LeagueSettings,
    public readonly scoringSettings: LeagueScoringSettings,
    public readonly rosterPositions: RosterPosition[],
    public readonly createdBy: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static fromDatabase(row: any): League {
    return new League(
      row.id,
      row.name,
      row.sport,
      row.season,
      row.season_type,
      row.status,
      row.total_rosters,
      row.avatar,
      row.draft_id,
      row.previous_league_id,
      row.settings,
      row.scoring_settings,
      row.roster_positions,
      row.created_by,
      row.created_at,
      row.updated_at,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      name: this.name,
      sport: this.sport,
      season: this.season,
      season_type: this.seasonType,
      status: this.status,
      total_rosters: this.totalRosters,
      avatar: this.avatar,
      draft_id: this.draftId,
      previous_league_id: this.previousLeagueId,
      settings: this.settings,
      scoring_settings: this.scoringSettings,
      roster_positions: this.rosterPositions,
      created_by: this.createdBy,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}

export class LeagueMember {
  constructor(
    public readonly id: string,
    public readonly leagueId: string,
    public readonly userId: string,
    public readonly role: string,
    public readonly displayName: string | null,
    public readonly username: string,
    public readonly joinedAt: Date,
  ) {}

  static fromDatabase(row: any): LeagueMember {
    return new LeagueMember(
      row.id,
      row.league_id,
      row.user_id,
      row.role,
      row.display_name,
      row.username,
      row.joined_at,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      league_id: this.leagueId,
      user_id: this.userId,
      role: this.role,
      display_name: this.displayName,
      username: this.username,
      joined_at: this.joinedAt,
    };
  }
}

export class LeagueInvite {
  constructor(
    public readonly id: string,
    public readonly leagueId: string,
    public readonly inviterId: string,
    public readonly inviteeId: string,
    public readonly status: 'pending' | 'accepted' | 'declined',
    public readonly inviterUsername: string,
    public readonly inviteeUsername: string,
    public readonly leagueName: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static fromDatabase(row: any): LeagueInvite {
    return new LeagueInvite(
      row.id,
      row.league_id,
      row.inviter_id,
      row.invitee_id,
      row.status,
      row.inviter_username,
      row.invitee_username,
      row.league_name,
      row.created_at,
      row.updated_at,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      league_id: this.leagueId,
      inviter_id: this.inviterId,
      invitee_id: this.inviteeId,
      status: this.status,
      inviter_username: this.inviterUsername,
      invitee_username: this.inviteeUsername,
      league_name: this.leagueName,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}

export interface RosterSettings {
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  waiver_position: number;
  [key: string]: number;
}

export const DEFAULT_ROSTER_SETTINGS: RosterSettings = {
  wins: 0,
  losses: 0,
  ties: 0,
  fpts: 0,
  waiver_position: 0,
};

export class Roster {
  constructor(
    public readonly id: string,
    public readonly rosterId: number,
    public readonly leagueId: string,
    public readonly ownerId: string | null,
    public readonly players: string[],
    public readonly starters: string[],
    public readonly reserve: string[],
    public readonly taxi: string[],
    public readonly settings: RosterSettings,
    public readonly metadata: Record<string, any>,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static fromDatabase(row: any): Roster {
    return new Roster(
      row.id,
      row.roster_id,
      row.league_id,
      row.owner_id,
      row.players ?? [],
      row.starters ?? [],
      row.reserve ?? [],
      row.taxi ?? [],
      row.settings ?? DEFAULT_ROSTER_SETTINGS,
      row.metadata ?? {},
      row.created_at,
      row.updated_at,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      roster_id: this.rosterId,
      league_id: this.leagueId,
      owner_id: this.ownerId,
      players: this.players,
      starters: this.starters,
      reserve: this.reserve,
      taxi: this.taxi,
      settings: this.settings,
      metadata: this.metadata,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}

// Public league interface for safe public data exposure
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
