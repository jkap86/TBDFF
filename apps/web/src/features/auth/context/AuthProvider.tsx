'use client';

import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authApi, tokenManager } from '@/lib/api';
// Note: setSessionCookie/clearSessionCookie manage a UX-only presence flag (tbdff_session).
// This cookie is NOT httpOnly and is trivially forgeable — it only controls client-side
// redirects in middleware.ts. Actual authentication uses JWT tokens via Authorization header.
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from httpOnly refresh cookie on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        // One-time migration: if old localStorage token exists, use it then delete it
        const legacyToken = localStorage.getItem('refreshToken');
        let result;
        if (legacyToken) {
          localStorage.removeItem('refreshToken');
          result = await authApi.refresh(legacyToken);
        } else {
          result = await authApi.refresh();
        }

        setUser(result.user);
        setAccessToken(result.token);
        setSessionCookie();
      } catch {
        // Refresh failed — clear session cookie
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
    setSessionCookie();
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const result = await authApi.register(username, email, password);
    setUser(result.user);
    setAccessToken(result.token);
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
    clearSessionCookie();
  }, [accessToken]);

  // Register refresh/logout handlers so the API client can auto-refresh on 401
  useEffect(() => {
    tokenManager.setHandlers(
      async () => {
        try {
          const result = await authApi.refresh();
          setUser(result.user);
          setAccessToken(result.token);
          setSessionCookie();
          return result.token;
        } catch {
          return null;
        }
      },
      async () => {
        setUser(null);
        setAccessToken(null);
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
