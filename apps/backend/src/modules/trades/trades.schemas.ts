import { z } from 'zod';

const baseFields = {
  side: z.enum(['proposer', 'receiver']),
  roster_id: z.number().int().min(1),
};

const playerItemSchema = z.object({
  ...baseFields,
  item_type: z.literal('player'),
  player_id: z.string(),
}).strict();

const draftPickItemSchema = z.object({
  ...baseFields,
  item_type: z.literal('draft_pick'),
  draft_pick_id: z.string().uuid(),
}).strict();

const faabItemSchema = z.object({
  ...baseFields,
  item_type: z.literal('faab'),
  faab_amount: z.number().int().min(1),
}).strict();

export const tradeItemSchema = z.discriminatedUnion('item_type', [
  playerItemSchema,
  draftPickItemSchema,
  faabItemSchema,
]);

export type TradeItemInput = z.infer<typeof tradeItemSchema>;

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
  status: z.enum([
    'pending', 'accepted', 'declined', 'withdrawn',
    'review', 'vetoed', 'completed', 'countered', 'expired',
  ]).optional(),
}).passthrough();
