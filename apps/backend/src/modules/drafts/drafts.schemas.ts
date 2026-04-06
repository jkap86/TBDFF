import { z } from 'zod';

const draftTypeEnum = z.enum(['snake', 'linear', '3rr', 'auction', 'slow_auction']);

const draftSettingsPartialSchema = z.object({
  teams: z.number().int().min(2).max(32).optional(),
  rounds: z.number().int().min(1).max(50).optional(),
  pick_timer: z.number().int().min(5).max(86400).optional(),
  nomination_timer: z.number().int().min(5).max(86400).optional(),
  offering_timer: z.number().int().min(5).max(86400).optional(),
  reversal_round: z.number().int().min(0).optional(),
  player_type: z.number().int().min(0).max(2).optional(), // 0=all, 1=rookies, 2=veterans
  cpu_autopick: z.number().int().min(0).max(1).optional(),
  autostart: z.number().int().min(0).max(1).optional(),
  autopause_enabled: z.number().int().min(0).max(1).optional(),
  autopause_start_time: z.number().int().min(0).optional(),
  autopause_end_time: z.number().int().min(0).optional(),
  alpha_sort: z.number().int().min(0).max(1).optional(),
  slots_qb: z.number().int().min(0).max(10).optional(),
  slots_rb: z.number().int().min(0).max(10).optional(),
  slots_wr: z.number().int().min(0).max(10).optional(),
  slots_te: z.number().int().min(0).max(10).optional(),
  slots_flex: z.number().int().min(0).max(10).optional(),
  slots_super_flex: z.number().int().min(0).max(10).optional(),
  slots_def: z.number().int().min(0).max(10).optional(),
  slots_k: z.number().int().min(0).max(10).optional(),
  slots_bn: z.number().int().min(0).max(20).optional(),
  budget: z.number().int().min(1).max(9999).optional(),
  max_players_per_team: z.number().int().min(0).max(50).optional(),
  include_rookie_picks: z.number().int().min(0).max(1).optional(),
  // Slow auction settings
  bid_window_seconds: z.number().int().min(60).max(604800).optional(),
  max_nominations_per_team: z.number().int().min(1).max(50).optional(),
  max_nominations_global: z.number().int().min(1).max(200).optional(),
  daily_nomination_limit: z.number().int().min(0).max(100).optional(),
  min_bid: z.number().int().min(1).max(999).optional(),
  min_increment: z.number().int().min(1).max(100).optional(),
  max_lot_duration_seconds: z.number().int().min(0).max(2592000).optional(), // 0 = no cap, max 30 days
  // Derby settings
  derby_timer: z.number().int().min(5).max(86400).optional(),
  derby_timeout_action: z.number().int().min(0).max(1).optional(), // 0=autopick, 1=skip
}).passthrough();

export const createDraftSchema = z.object({
  type: draftTypeEnum.optional(),
  settings: draftSettingsPartialSchema.optional(),
}).strict();

export type CreateDraftInput = z.infer<typeof createDraftSchema>;

export const updateDraftSchema = z.object({
  type: draftTypeEnum.optional(),
  start_time: z.string().datetime().nullable().optional(),
  settings: draftSettingsPartialSchema.optional(),
  metadata: z.record(z.string(), z.any()).optional(),
}).strict();

export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;

export const setDraftOrderSchema = z.object({
  draft_order: z.record(z.string(), z.number().int().min(1)),
  slot_to_roster_id: z.record(z.string(), z.number().int().min(1)),
}).strict();

export type SetDraftOrderInput = z.infer<typeof setDraftOrderSchema>;

export const makeDraftPickSchema = z.object({
  player_id: z.string().min(1, 'Player ID is required'),
}).strict();

export type MakeDraftPickInput = z.infer<typeof makeDraftPickSchema>;

// Auction-specific schemas
export const nominateDraftPickSchema = z.object({
  player_id: z.string().min(1, 'Player ID is required'),
  amount: z.number().int().min(1, 'Minimum bid is $1'),
}).strict();

export type NominateDraftPickInput = z.infer<typeof nominateDraftPickSchema>;

export const placeBidSchema = z.object({
  amount: z.number().int().min(1, 'Minimum bid is $1'),
}).strict();

export type PlaceBidInput = z.infer<typeof placeBidSchema>;

// Queue schemas
export const setDraftQueueSchema = z.object({
  player_ids: z.array(z.string().min(1)).max(500),
}).strict();

export type SetDraftQueueInput = z.infer<typeof setDraftQueueSchema>;

export const addToQueueSchema = z.object({
  player_id: z.string().min(1, 'Player ID is required'),
  max_bid: z.number().int().min(0).nullable().optional(),
}).strict();

export type AddToQueueInput = z.infer<typeof addToQueueSchema>;

export const updateQueueMaxBidSchema = z.object({
  max_bid: z.number().int().min(0).nullable(),
}).strict();

export type UpdateQueueMaxBidInput = z.infer<typeof updateQueueMaxBidSchema>;

// Slow auction schemas
export const slowNominateSchema = z.object({
  player_id: z.string().min(1, 'Player ID is required'),
}).strict();

export type SlowNominateInput = z.infer<typeof slowNominateSchema>;

export const slowSetMaxBidSchema = z.object({
  max_bid: z.number().int().min(1, 'Minimum bid is $1'),
}).strict();

export type SlowSetMaxBidInput = z.infer<typeof slowSetMaxBidSchema>;

// Timer update schema (mid-draft)
export const updateTimersSchema = z.object({
  nomination_timer: z.number().int().min(5).max(86400).optional(),
  offering_timer: z.number().int().min(5).max(86400).optional(),
  pick_timer: z.number().int().min(5).max(86400).optional(),
  bid_window_seconds: z.number().int().min(60).max(604800).optional(),
}).strict().refine(data => Object.keys(data).length > 0, { message: 'At least one timer must be provided' });

export type UpdateTimersInput = z.infer<typeof updateTimersSchema>;

// Derby schemas
export const derbyPickSchema = z.object({
  slot: z.number().int().min(1, 'Slot must be at least 1'),
}).strict();

export type DerbyPickInput = z.infer<typeof derbyPickSchema>;

export const availablePlayersQuerySchema = z.object({
  position: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).passthrough();
