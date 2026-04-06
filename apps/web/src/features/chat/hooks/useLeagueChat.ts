'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { chatApi, ApiError } from '@tbdff/shared';
import type { ChatMessage } from '@tbdff/shared';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useSocket } from '../context/SocketProvider';

const TYPING_EXPIRY_MS = 3000;

export function useLeagueChat(leagueId: string) {
  const { accessToken } = useAuth();
  const { socket, sendMessage, connectionStatus, emitTyping } = useSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Room join/leave is handled by LeagueIdSync — no need to duplicate here.

  // Listen for incoming messages in this league
  useEffect(() => {
    if (!socket) return;
    const handler = (msg: ChatMessage) => {
      if (msg.league_id === leagueId) {
        setMessages((prev) => [...prev, msg]);
        // Clear typing indicator for sender
        if (msg.sender_username) {
          setTypingUsers((prev) => prev.filter((u) => u !== msg.sender_username));
        }
      }
    };
    socket.on('chat:message', handler);
    return () => {
      socket.off('chat:message', handler);
    };
  }, [socket, leagueId]);

  // Listen for socket errors (rate limits, etc.)
  useEffect(() => {
    if (!socket) return;
    const handler = (err: { message: string }) => {
      setSocketError(err.message);
      const timer = setTimeout(() => setSocketError(null), 3000);
      return () => clearTimeout(timer);
    };
    socket.on('chat:error', handler);
    return () => {
      socket.off('chat:error', handler);
    };
  }, [socket]);

  // Listen for typing indicators
  useEffect(() => {
    if (!socket) return;
    const handler = (data: { username: string; roomType: string; roomId: string }) => {
      if (data.roomType !== 'league' || data.roomId !== leagueId) return;
      const { username } = data;

      setTypingUsers((prev) => (prev.includes(username) ? prev : [...prev, username]));

      // Clear existing timer for this user
      const existing = typingTimers.current.get(username);
      if (existing) clearTimeout(existing);

      // Auto-expire after 3s
      const timer = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u !== username));
        typingTimers.current.delete(username);
      }, TYPING_EXPIRY_MS);
      typingTimers.current.set(username, timer);
    };
    socket.on('chat:user_typing', handler);
    return () => {
      socket.off('chat:user_typing', handler);
      // Clean up timers
      for (const timer of typingTimers.current.values()) clearTimeout(timer);
      typingTimers.current.clear();
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

  const jumpToDate = useCallback(
    async (date: Date) => {
      if (!accessToken) return;
      try {
        setIsLoading(true);
        setError(null);
        const iso = date.toISOString();
        const result = await chatApi.getLeagueMessages(leagueId, accessToken, {
          limit: 50,
          after: iso,
        });
        // after query returns ASC order — already chronological
        setMessages(result.messages);
        // There are likely older messages before this date
        setHasMore(true);
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
        else setError('Failed to load messages');
      } finally {
        setIsLoading(false);
      }
    },
    [leagueId, accessToken],
  );

  // Debounced typing emitter — emit at most once per 2s
  const lastTypingRef = useRef(0);
  const handleTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingRef.current > 2000) {
      lastTypingRef.current = now;
      emitTyping('league', leagueId);
    }
  }, [leagueId, emitTyping]);

  return {
    messages,
    isLoading,
    error,
    hasMore,
    send,
    loadMore,
    socketError,
    connectionStatus,
    typingUsers,
    handleTyping,
    jumpToDate,
  };
}
