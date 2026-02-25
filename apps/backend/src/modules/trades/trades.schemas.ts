import { z } from 'zod';

const tradeItemSchema = z.object({
  side: z.enum(['proposer', 'receiver']),
  item_type: z.enum(['player', 'draft_pick', 'faab']),
  player_id: z.string().optional(),
  draft_pick_id: z.string().uuid().optional(),
  faab_amount: z.number().int().min(1).optional(),
  roster_id: z.number().int().min(1),
});

export const proposeTradeSchema = z.object({
  proposed_to: z.string().uuid('Invalid user ID'),
  message: z.string().max(500).optional(),
  items: z.array(tradeItemSchema).min(1, 'Trade must include at least one item'),
}).strict();

export type ProposeTradeInput = z.infer<typeof proposeTradeSchema>;

export const counterTradeSchema = z.object({
  message: z.string().max(500).optional(),
  items: z.array(tradeItemSchema).min(1, 'Counter-offer must include at least one item'),
}).strict();

export type CounterTradeInput = z.infer<typeof counterTradeSchema>;

export const tradeListQuerySchema = z.object({
  status: z.string().optional(),
}).passthrough();
