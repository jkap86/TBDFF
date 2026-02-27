import { z } from 'zod';

export const setBuyInSchema = z.object({
  buy_in: z.number().min(0, 'Buy-in cannot be negative'),
}).strict();

export type SetBuyInInput = z.infer<typeof setBuyInSchema>;

export const recordBuyInSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  amount: z.number().positive('Amount must be positive'),
}).strict();

export type RecordBuyInInput = z.infer<typeof recordBuyInSchema>;

export const recordPayoutSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  amount: z.number().positive('Amount must be positive'),
  note: z.string().max(200).optional(),
}).strict();

export type RecordPayoutInput = z.infer<typeof recordPayoutSchema>;
