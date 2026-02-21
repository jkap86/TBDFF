'use client';

import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authApi, tokenManager } from '@/lib/api';
import { storage } from '@/lib/storage';
import { setSessionCookie, clearSessionCookie } from '@/lib/cookie';
import type { User } from '@tbdff/shared';

export interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const REFRESH_TOKEN_KEY = 'refreshToken';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from stored refresh token on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedRefreshToken = await storage.getItem(REFRESH_TOKEN_KEY);
        if (!storedRefreshToken) {
          setIsLoading(false);
          return;
        }

        const result = await authApi.refresh(storedRefreshToken);
        setUser(result.user);
        setAccessToken(result.token);
        await storage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
        setSessionCookie();
      } catch {
        // Refresh failed — clear stored token and cookie
        await storage.deleteItem(REFRESH_TOKEN_KEY);
        clearSessionCookie();
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await authApi.login(username, password);
    setUser(result.user);
    setAccessToken(result.token);
    await storage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
    setSessionCookie();
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const result = await authApi.register(username, email, password);
    setUser(result.user);
    setAccessToken(result.token);
    await storage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
    setSessionCookie();
  }, []);

  const logout = useCallback(async () => {
    try {
      if (accessToken) {
        await authApi.logout(accessToken);
      }
    } catch {
      // Ignore logout errors — clear local state regardless
    }
    setUser(null);
    setAccessToken(null);
    await storage.deleteItem(REFRESH_TOKEN_KEY);
    clearSessionCookie();
  }, [accessToken]);

  // Register refresh/logout handlers so the API client can auto-refresh on 401
  useEffect(() => {
    tokenManager.setHandlers(
      async () => {
        const storedRefreshToken = await storage.getItem(REFRESH_TOKEN_KEY);
        if (!storedRefreshToken) return null;

        try {
          const result = await authApi.refresh(storedRefreshToken);
          setUser(result.user);
          setAccessToken(result.token);
          await storage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
          setSessionCookie();
          return result.token;
        } catch {
          return null;
        }
      },
      async () => {
        setUser(null);
        setAccessToken(null);
        await storage.deleteItem(REFRESH_TOKEN_KEY);
        clearSessionCookie();
      }
    );

    return () => tokenManager.clearHandlers();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
