import { apiClient } from '../api/client';
import type { AuthResponse, UserResponse } from '../types/auth';

export const authApi = {
  register: (username: string, email: string, password: string) =>
    apiClient.post<AuthResponse>('/auth/register', { username, email, password }),

  login: (username: string, password: string) =>
    apiClient.post<AuthResponse>('/auth/login', { username, password }),

  refresh: (refreshToken?: string) =>
    apiClient.post<AuthResponse>('/auth/refresh', refreshToken ? { refreshToken } : undefined),

  me: (token: string) =>
    apiClient.get<UserResponse>('/auth/me', token),

  logout: (token: string) =>
    apiClient.post<{ message: string }>('/auth/logout', undefined, token),

  clearSession: (refreshToken?: string) =>
    apiClient.post<{ message: string }>('/auth/clear-session', refreshToken ? { refreshToken } : undefined),

  forgotPassword: (email: string) =>
    apiClient.post<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    apiClient.post<{ message: string }>('/auth/reset-password', { token, password }),
};
