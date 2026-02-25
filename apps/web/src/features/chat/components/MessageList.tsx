'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@tbdff/shared';

interface Props {
  messages: ChatMessage[];
  currentUserId: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function MessageList({ messages, currentUserId, onLoadMore, hasMore }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevFirstMsgIdRef = useRef<string | null>(null);
  const wasAtBottomRef = useRef(true);

  // Track whether user is near the bottom before messages change
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const threshold = 80;
      wasAtBottomRef.current =
        container.scrollTop + container.clientHeight >= container.scrollHeight - threshold;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      prevFirstMsgIdRef.current = null;
      return;
    }

    const firstMsgId = messages[0].id;
    const prevFirstId = prevFirstMsgIdRef.current;
    prevFirstMsgIdRef.current = firstMsgId;

    // If the first message ID changed, older messages were prepended — don't scroll
    if (prevFirstId !== null && firstMsgId !== prevFirstId) {
      return;
    }

    // New message appended (or initial load) — scroll to bottom if user was already there
    if (wasAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-sm text-gray-400 dark:text-gray-500">No messages yet. Say hello!</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-1 overflow-y-auto p-3">
      {hasMore && (
        <button
          onClick={onLoadMore}
          className="mb-2 self-center text-xs text-blue-500 hover:underline"
        >
          Load older messages
        </button>
      )}
      {messages.map((msg) => {
        const isOwn = msg.sender_id === currentUserId;
        const time = new Date(msg.created_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
            {!isOwn && (
              <span className="mb-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                {msg.sender_username}
              </span>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm break-words ${
                isOwn
                  ? 'rounded-tr-sm bg-blue-600 text-white'
                  : 'rounded-tl-sm bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white'
              }`}
            >
              {msg.content}
            </div>
            <span className="mt-0.5 text-xs text-gray-400">{time}</span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
