'use client';

import { useState, useEffect, useCallback } from 'react';
import { chatApi, ApiError } from '@tbdff/shared';
import type { ChatMessage } from '@tbdff/shared';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useSocket } from '../context/SocketProvider';

export function useDMChat(conversationId: string) {
  const { accessToken } = useAuth();
  const { socket, joinDM, leaveDM, sendMessage } = useSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Join the DM room on mount, leave on unmount
  useEffect(() => {
    joinDM(conversationId);
    return () => {
      leaveDM(conversationId);
    };
  }, [conversationId, joinDM, leaveDM]);

  // Listen for incoming messages in this conversation
  useEffect(() => {
    if (!socket) return;
    const handler = (msg: ChatMessage) => {
      if (msg.conversation_id === conversationId) {
        setMessages((prev) => [...prev, msg]);
      }
    };
    socket.on('chat:message', handler);
    return () => {
      socket.off('chat:message', handler);
    };
  }, [socket, conversationId]);

  // Fetch message history
  const fetchMessages = useCallback(
    async (before?: string) => {
      if (!accessToken) return;
      try {
        if (!before) setIsLoading(true);
        setError(null);
        const result = await chatApi.getConversationMessages(conversationId, accessToken, {
          limit: 50,
          before,
        });
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
    [conversationId, accessToken],
  );

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const send = useCallback(
    (content: string) => {
      sendMessage('dm', conversationId, content);
    },
    [conversationId, sendMessage],
  );

  const loadMore = useCallback(() => {
    if (messages.length > 0) {
      fetchMessages(messages[0].id);
    }
  }, [messages, fetchMessages]);

  return { messages, isLoading, error, hasMore, send, loadMore };
}
