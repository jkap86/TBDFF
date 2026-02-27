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

export const setPayoutsSchema = z.object({
  payouts: z.array(z.object({
    category: z.enum(['place', 'points']),
    position: z.number().int().positive('Position must be a positive integer'),
    value: z.number().positive('Value must be positive'),
    is_percentage: z.boolean(),
  }).strict()).max(50),
}).strict();

export type SetPayoutsInput = z.infer<typeof setPayoutsSchema>;
