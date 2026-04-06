import { z } from 'zod';

export const getMessagesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().uuid().optional(),
  after: z.string().optional(),
});

export const startConversationSchema = z.object({
  user_id: z.string().uuid('user_id must be a valid UUID'),
}).strict();

export type GetMessagesInput = z.infer<typeof getMessagesSchema>;
export type StartConversationInput = z.infer<typeof startConversationSchema>;
