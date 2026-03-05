import { z } from 'zod';

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username must contain only letters, numbers, and underscores'
    ),
  email: z
    .string()
    .email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const searchUsersSchema = z.object({
  q: z.string().min(1).max(20),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type SearchUsersInput = z.infer<typeof searchUsersSchema>;
