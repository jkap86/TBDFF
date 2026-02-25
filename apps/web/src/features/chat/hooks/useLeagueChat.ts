'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { chatApi, ApiError } from '@tbdff/shared';
import type { ChatMessage } from '@tbdff/shared';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useSocket } from '../context/SocketProvider';

export function useLeagueChat(leagueId: string) {
  const { accessToken } = useAuth();
  const { socket, joinLeague, leaveLeague, sendMessage } = useSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const joinedRef = useRef(false);

  // Join Socket.IO room on mount, leave on unmount
  useEffect(() => {
    joinLeague(leagueId);
    joinedRef.current = true;
    return () => {
      leaveLeague(leagueId);
      joinedRef.current = false;
    };
  }, [leagueId, joinLeague, leaveLeague]);

  // Listen for incoming messages in this league
  useEffect(() => {
    if (!socket) return;
    const handler = (msg: ChatMessage) => {
      if (msg.league_id === leagueId) {
        setMessages((prev) => [...prev, msg]);
      }
    };
    socket.on('chat:message', handler);
    return () => {
      socket.off('chat:message', handler);
    };
  }, [socket, leagueId]);

  // Fetch message history
  const fetchMessages = useCallback(
    async (before?: string) => {
      if (!accessToken) return;
      try {
        if (!before) setIsLoading(true);
        setError(null);
        const result = await chatApi.getLeagueMessages(leagueId, accessToken, {
          limit: 50,
          before,
        });
        // API returns newest-first; reverse to show oldest-first in the UI
        const reversed = [...result.messages].reverse();
        setMessages((prev) => (before ? [...reversed, ...prev] : reversed));
        setHasMore(result.messages.length === 50);
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
        else setError('Failed to load messages');
      } finally {
        setIsLoading(false);
      }
    },
    [leagueId, accessToken],
  );

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const send = useCallback(
    (content: string) => {
      sendMessage('league', leagueId, content);
    },
    [leagueId, sendMessage],
  );

  const loadMore = useCallback(() => {
    if (messages.length > 0) {
      fetchMessages(messages[0].id);
    }
  }, [messages, fetchMessages]);

  return { messages, isLoading, error, hasMore, send, loadMore };
}
