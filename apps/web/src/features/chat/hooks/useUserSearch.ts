'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { chatApi } from '@tbdff/shared';
import type { UserSearchResult } from '@tbdff/shared';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function useUserSearch() {
  const { accessToken } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!query.trim() || !accessToken) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await chatApi.searchUsers(query.trim(), accessToken);
        setResults(res.users);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, accessToken]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
  }, []);

  return { query, setQuery, results, isSearching, clearSearch };
}
