import { z } from 'zod';

export const addPlayerSchema = z.object({
  player_id: z.string().min(1, 'Player ID is required'),
  drop_player_id: z.string().optional(),
}).strict();

export type AddPlayerInput = z.infer<typeof addPlayerSchema>;

export const dropPlayerSchema = z.object({
  player_id: z.string().min(1, 'Player ID is required'),
}).strict();

export type DropPlayerInput = z.infer<typeof dropPlayerSchema>;

export const placeWaiverClaimSchema = z.object({
  player_id: z.string().min(1, 'Player ID is required'),
  drop_player_id: z.string().optional(),
  faab_amount: z.number().int().min(0).optional(),
}).strict();

export type PlaceWaiverClaimInput = z.infer<typeof placeWaiverClaimSchema>;

export const updateWaiverClaimSchema = z.object({
  drop_player_id: z.string().nullable().optional(),
  faab_amount: z.number().int().min(0).optional(),
}).strict();

export type UpdateWaiverClaimInput = z.infer<typeof updateWaiverClaimSchema>;

export const transactionListQuerySchema = z.object({
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).passthrough();
