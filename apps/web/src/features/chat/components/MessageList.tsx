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
        <p className="text-sm text-disabled">No messages yet. Say hello!</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-1 overflow-y-auto p-3">
      {hasMore && (
        <button
          onClick={onLoadMore}
          className="mb-2 self-center text-xs text-link hover:underline"
        >
          Load older messages
        </button>
      )}
      {messages.map((msg) => {
        const time = new Date(msg.created_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

        if (msg.message_type === 'system') {
          return (
            <div key={msg.id} className="flex flex-col items-center py-1">
              <div className="rounded-2xl bg-[#ff8c00] px-3 py-2 text-center shadow-[0_2px_6px_rgba(0,0,0,0.25)]">
                <span className="text-xs text-white italic">
                  {msg.content}
                </span>
                <span className="ml-2 inline-block align-bottom text-xs leading-none text-white/60">{time}</span>
              </div>
            </div>
          );
        }

        const isOwn = msg.sender_id === currentUserId;

        return (
          <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm break-words shadow-[0_2px_6px_rgba(0,0,0,0.25)] ${
                isOwn
                  ? 'rounded-tr-sm bg-primary text-primary-foreground'
                  : 'rounded-tl-sm bg-[#e6264d] text-white'
              }`}
            >
              {!isOwn && (
                <span className="block text-xs font-medium text-neon-cyan mb-0.5">
                  {msg.sender_username}
                </span>
              )}
              {msg.content}
              <span className={`ml-2 inline-block align-bottom text-xs leading-none ${
                isOwn ? 'text-primary-foreground/60' : 'text-white/60'
              }`}>{time}</span>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
