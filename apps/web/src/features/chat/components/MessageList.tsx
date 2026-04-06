'use client';

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import type { ChatMessage } from '@tbdff/shared';

interface Props {
  messages: ChatMessage[];
  currentUserId: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  typingUsers?: string[];
  onJumpToDate?: (date: Date) => void;
}

/* ── Linkify helper ─────────────────────────────────────────────── */

const URL_RE = /https?:\/\/[^\s<>)"']+/g;

function linkifyContent(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[0];
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all hover:opacity-80"
      >
        {url}
      </a>,
    );
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length === 1 ? parts[0] : parts;
}

/* ── Date helpers ───────────────────────────────────────────────── */

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateSeparator(date: Date): string {
  const now = new Date();
  if (isSameDay(date, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/* ── Grouping helpers ───────────────────────────────────────────── */

const GROUP_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

function isGrouped(prev: ChatMessage | undefined, curr: ChatMessage | undefined): boolean {
  if (!prev || !curr) return false;
  if (prev.message_type === 'system' || curr.message_type === 'system') return false;
  if (prev.sender_id !== curr.sender_id) return false;
  return (
    new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_WINDOW_MS
  );
}

/* ── Component ──────────────────────────────────────────────────── */

export function MessageList({
  messages,
  currentUserId,
  onLoadMore,
  hasMore,
  typingUsers,
  onJumpToDate,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const prevFirstMsgIdRef = useRef<string | null>(null);
  const wasAtBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Track whether user is near the bottom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const threshold = 80;
      const atBottom =
        container.scrollTop + container.clientHeight >= container.scrollHeight - threshold;
      wasAtBottomRef.current = atBottom;
      setShowScrollBtn(!atBottom);
      if (atBottom) setNewMsgCount(0);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Infinite scroll — auto-load older messages when top sentinel is visible
  const loadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);
  loadMoreRef.current = onLoadMore;
  hasMoreRef.current = hasMore;

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && loadMoreRef.current) {
          setIsLoadingMore(true);
          loadMoreRef.current();
        }
      },
      { root: containerRef.current, rootMargin: '200px 0px 0px 0px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      prevFirstMsgIdRef.current = null;
      return;
    }

    const firstMsgId = messages[0].id;
    const prevFirstId = prevFirstMsgIdRef.current;
    prevFirstMsgIdRef.current = firstMsgId;

    setIsLoadingMore(false);

    // Older messages prepended — don't scroll
    if (prevFirstId !== null && firstMsgId !== prevFirstId) {
      return;
    }

    // New message appended (or initial load)
    if (wasAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      // User is scrolled up — count new messages
      setNewMsgCount((c) => c + 1);
    }
  }, [messages]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setNewMsgCount(0);
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-sm text-disabled">No messages yet. Say hello!</p>
      </div>
    );
  }

  const activeTyping = typingUsers && typingUsers.length > 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Fixed jump-to-date bar */}
      {onJumpToDate && (
        <div className="flex shrink-0 items-center justify-center border-b border-border bg-background/80 py-1 backdrop-blur-sm">
          <input
            ref={dateInputRef}
            type="date"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              if (e.target.value) {
                const [y, m, d] = e.target.value.split('-').map(Number);
                onJumpToDate(new Date(y, m - 1, d));
                e.target.value = '';
              }
            }}
          />
          <button
            onClick={() => dateInputRef.current?.showPicker()}
            className="flex items-center gap-1 text-xs text-link hover:underline"
            aria-label="Jump to date"
          >
            <CalendarDays className="h-3 w-3" />
            Jump to date
          </button>
        </div>
      )}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {/* Sentinel for infinite scroll */}
        <div ref={topSentinelRef} className="h-px" />
        {isLoadingMore && (
          <div className="flex items-center justify-center py-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        )}
        {messages.map((msg, i) => {
          const prev = i > 0 ? messages[i - 1] : undefined;
          const next = i < messages.length - 1 ? messages[i + 1] : undefined;
          const msgDate = new Date(msg.created_at);
          const time = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          const elements: ReactNode[] = [];

          // Date separator
          if (!prev || !isSameDay(new Date(prev.created_at), msgDate)) {
            elements.push(
              <div key={`date-${msg.id}`} className="flex items-center gap-3 py-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground">
                  {formatDateSeparator(msgDate)}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>,
            );
          }

          if (msg.message_type === 'system') {
            elements.push(
              <div key={msg.id} className="flex flex-col items-center py-1">
                <div className="rounded-2xl bg-[#ff8c00] px-3 py-2 text-center shadow-[0_2px_6px_rgba(0,0,0,0.25)]">
                  <span className="text-xs text-white italic">
                    {linkifyContent(msg.content)}
                  </span>
                  <span className="ml-2 inline-block align-bottom text-xs leading-none text-white/60">
                    {time}
                  </span>
                </div>
              </div>,
            );
            return elements;
          }

          const isOwn = msg.sender_id === currentUserId;
          const grouped = isGrouped(prev, msg);
          const isLastInGroup = !isGrouped(msg, next);

          // Bubble border-radius: grouped middles get tighter corners on the sender side
          let bubbleRadius: string;
          if (isOwn) {
            bubbleRadius = grouped
              ? isLastInGroup
                ? 'rounded-2xl rounded-tr-sm rounded-br-sm'
                : 'rounded-2xl rounded-tr-sm rounded-br-sm'
              : isLastInGroup
                ? 'rounded-2xl rounded-tr-sm'
                : 'rounded-2xl rounded-tr-sm rounded-br-sm';
          } else {
            bubbleRadius = grouped
              ? isLastInGroup
                ? 'rounded-2xl rounded-tl-sm rounded-bl-sm'
                : 'rounded-2xl rounded-tl-sm rounded-bl-sm'
              : isLastInGroup
                ? 'rounded-2xl rounded-tl-sm'
                : 'rounded-2xl rounded-tl-sm rounded-bl-sm';
          }

          elements.push(
            <div
              key={msg.id}
              className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${grouped ? 'mt-0' : 'mt-1.5'}`}
            >
              <div
                className={`max-w-[75%] ${bubbleRadius} px-3 ${grouped ? 'py-1' : 'py-2'} text-sm break-words shadow-[0_2px_6px_rgba(0,0,0,0.25)] ${
                  isOwn
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-[#e6264d] text-white'
                }`}
              >
                {!isOwn && !grouped && (
                  <span className="block text-xs font-medium text-neon-cyan mb-0.5">
                    {msg.sender_username}
                  </span>
                )}
                {linkifyContent(msg.content)}
                {isLastInGroup && (
                  <span
                    className={`ml-2 inline-block align-bottom text-xs leading-none ${
                      isOwn ? 'text-primary-foreground/60' : 'text-white/60'
                    }`}
                  >
                    {time}
                  </span>
                )}
              </div>
            </div>,
          );

          return elements;
        })}

        {/* Typing indicator */}
        {activeTyping && (
          <div className="mt-1 flex items-center gap-1.5 px-1">
            <div className="flex gap-0.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
            </div>
            <span className="text-xs text-muted-foreground">
              {typingUsers!.length === 1
                ? `${typingUsers![0]} is typing`
                : `${typingUsers!.slice(0, 2).join(', ')} ${typingUsers!.length > 2 ? `and ${typingUsers!.length - 2} more ` : ''}are typing`}
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-foreground shadow-lg backdrop-blur-sm hover:bg-background transition-opacity"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          {newMsgCount > 0 && (
            <span className="font-medium text-primary">{newMsgCount} new</span>
          )}
        </button>
      )}
    </div>
  );
}
