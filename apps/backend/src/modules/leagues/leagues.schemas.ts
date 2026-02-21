import { z } from 'zod';

/**
 * Enum validators for league fields
 */
const leagueStatusEnum = z.enum(['pre_draft', 'drafting', 'in_season', 'complete']);
const seasonTypeEnum = z.enum(['regular', 'pre', 'post']);
const rosterPositionEnum = z.enum([
  'QB', 'RB', 'WR', 'TE', 'K', 'DEF',
  'FLEX', 'SUPER_FLEX', 'REC_FLEX', 'WRRB_FLEX',
  'BN', 'IR'
]);

/**
 * Partial LeagueSettings schema (Sleeper-compatible)
 * All fields are optional to support partial updates
 */
const leagueSettingsPartialSchema = z.object({
  num_teams: z.number().int().min(2).max(32).optional(),
  bench_lock: z.number().int().min(0).max(1).optional(),
  capacity_override: z.number().int().min(0).optional(),
  commissioner_direct_invite: z.number().int().min(0).max(1).optional(),
  daily_waivers: z.number().int().min(0).max(1).optional(),
  daily_waivers_hour: z.number().int().min(0).max(23).optional(),
  disable_adds: z.number().int().min(0).max(1).optional(),
  draft_rounds: z.number().int().min(1).max(50).optional(),
  league_average_match: z.number().int().min(0).max(1).optional(),
  leg: z.number().int().min(1).optional(),
  max_keepers: z.number().int().min(0).optional(),
  offseason_adds: z.number().int().min(0).max(1).optional(),
  pick_trading: z.number().int().min(0).max(1).optional(),
  playoff_round_type: z.number().int().min(0).optional(),
  playoff_seed_type: z.number().int().min(0).optional(),
  playoff_teams: z.number().int().min(2).max(16).optional(),
  playoff_type: z.number().int().min(0).optional(),
  playoff_week_start: z.number().int().min(1).max(18).optional(),
  reserve_allow_cov: z.number().int().min(0).max(1).optional(),
  reserve_allow_dnr: z.number().int().min(0).max(1).optional(),
  reserve_allow_doubtful: z.number().int().min(0).max(1).optional(),
  reserve_allow_na: z.number().int().min(0).max(1).optional(),
  reserve_allow_out: z.number().int().min(0).max(1).optional(),
  reserve_allow_sus: z.number().int().min(0).max(1).optional(),
  reserve_slots: z.number().int().min(0).max(10).optional(),
  taxi_allow_vets: z.number().int().min(0).max(1).optional(),
  taxi_deadline: z.number().int().min(0).optional(),
  taxi_slots: z.number().int().min(0).max(10).optional(),
  taxi_years: z.number().int().min(0).optional(),
  trade_deadline: z.number().int().min(0).max(18).optional(),
  trade_review_days: z.number().int().min(0).max(7).optional(),
  type: z.number().int().min(0).max(2).optional(), // 0=redraft, 1=keeper, 2=dynasty
  waiver_bid_min: z.number().int().min(0).optional(),
  waiver_budget: z.number().int().min(0).optional(),
  waiver_clear_days: z.number().int().min(0).max(7).optional(),
  waiver_day_of_week: z.number().int().min(0).max(6).optional(),
  waiver_type: z.number().int().min(0).optional(),
}).strict();

/**
 * Partial LeagueScoringSettings schema
 * All fields are optional to support partial updates
 * Uses passthrough to allow additional custom scoring rules
 */
const scoringSettingsPartialSchema = z.object({
  // Passing
  pass_td: z.number().optional(),
  pass_yd: z.number().optional(),
  pass_int: z.number().optional(),
  pass_2pt: z.number().optional(),
  pass_att: z.number().optional(),
  pass_cmp: z.number().optional(),
  pass_inc: z.number().optional(),
  pass_sack: z.number().optional(),
  // Rushing
  rush_td: z.number().optional(),
  rush_yd: z.number().optional(),
  rush_att: z.number().optional(),
  rush_2pt: z.number().optional(),
  // Receiving
  rec: z.number().optional(),
  rec_td: z.number().optional(),
  rec_yd: z.number().optional(),
  rec_2pt: z.number().optional(),
  // Fumbles
  fum: z.number().optional(),
  fum_lost: z.number().optional(),
  fum_rec_td: z.number().optional(),
  // Kicking
  fgm_0_19: z.number().optional(),
  fgm_20_29: z.number().optional(),
  fgm_30_39: z.number().optional(),
  fgm_40_49: z.number().optional(),
  fgm_50p: z.number().optional(),
  fgmiss: z.number().optional(),
  xpm: z.number().optional(),
  xpmiss: z.number().optional(),
  // Defense
  sack: z.number().optional(),
  int: z.number().optional(),
  ff: z.number().optional(),
  fum_rec: z.number().optional(),
  def_td: z.number().optional(),
  safe: z.number().optional(),
  blk_kick: z.number().optional(),
  pts_allow_0: z.number().optional(),
  pts_allow_1_6: z.number().optional(),
  pts_allow_7_13: z.number().optional(),
  pts_allow_14_20: z.number().optional(),
  pts_allow_21_27: z.number().optional(),
  pts_allow_28_34: z.number().optional(),
  pts_allow_35p: z.number().optional(),
  // Special Teams
  st_td: z.number().optional(),
  st_ff: z.number().optional(),
  st_fum_rec: z.number().optional(),
  def_st_td: z.number().optional(),
  def_st_ff: z.number().optional(),
  def_st_fum_rec: z.number().optional(),
}).passthrough(); // Allow additional custom scoring keys

/**
 * Schema for updating league settings as commissioner/owner.
 *
 * All fields are optional (PATCH semantics).
 * Only commissioner and owner roles can update leagues.
 *
 * Editable fields:
 * - name: League display name (1-100 chars)
 * - season_type: 'regular' | 'pre' | 'post'
 * - status: 'pre_draft' | 'drafting' | 'in_season' | 'complete'
 * - total_rosters: Team count (2-32, cannot reduce below current members)
 * - avatar: League image URL (nullable)
 * - settings: Partial LeagueSettings object (39 Sleeper fields)
 * - scoring_settings: Partial scoring config (50+ scoring rules)
 * - roster_positions: Array of position slots
 *
 * Read-only fields (rejected if provided):
 * - id, sport, season, draft_id, previous_league_id, created_by, created_at, updated_at
 */
export const updateLeagueSchema = z.object({
  name: z.string().min(1, 'League name must be at least 1 character').max(100, 'League name must be at most 100 characters').optional(),
  season_type: seasonTypeEnum.optional(),
  status: leagueStatusEnum.optional(),
  total_rosters: z.number().int().min(2, 'Total rosters must be at least 2').max(32, 'Total rosters must be at most 32').optional(),
  avatar: z.string().url('Avatar must be a valid URL').nullable().optional(),
  settings: leagueSettingsPartialSchema.optional(),
  scoring_settings: scoringSettingsPartialSchema.optional(),
  roster_positions: z.array(rosterPositionEnum).min(1, 'Must have at least 1 roster position').max(30, 'Cannot have more than 30 roster positions').optional(),
}).strict(); // Reject unknown fields like id, season, created_by, etc.

export type UpdateLeagueInput = z.infer<typeof updateLeagueSchema>;
