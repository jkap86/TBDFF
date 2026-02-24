import { z } from 'zod';

const draftTypeEnum = z.enum(['snake', 'linear', '3rr', 'auction']);

const draftSettingsPartialSchema = z.object({
  teams: z.number().int().min(2).max(32).optional(),
  rounds: z.number().int().min(1).max(50).optional(),
  pick_timer: z.number().int().min(0).max(86400).optional(),
  nomination_timer: z.number().int().min(0).max(86400).optional(),
  offering_timer: z.number().int().min(0).max(86400).optional(),
  reversal_round: z.number().int().min(0).optional(),
  player_type: z.number().int().min(0).max(1).optional(),
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
