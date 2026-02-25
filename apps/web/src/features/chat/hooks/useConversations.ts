'use client';

import { useState, useEffect, useCallback } from 'react';
import { chatApi, ApiError } from '@tbdff/shared';
import type { Conversation } from '@tbdff/shared';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function useConversations() {
  const { accessToken } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      setError(null);
      const result = await chatApi.getMyConversations(accessToken);
      setConversations(result.conversations);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to load conversations');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const startConversation = useCallback(
    async (userId: string): Promise<Conversation> => {
      if (!accessToken) throw new Error('Not authenticated');
      const result = await chatApi.startConversation(userId, accessToken);
      setConversations((prev) => {
        if (prev.find((c) => c.id === result.conversation.id)) return prev;
        return [result.conversation, ...prev];
      });
      return result.conversation;
    },
    [accessToken],
  );

  return { conversations, isLoading, error, startConversation, refetch: fetchConversations };
}
