'use client';

import { useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import type { Conversation } from '@tbdff/shared';
import { useUserSearch } from '../hooks/useUserSearch';

interface Props {
  conversations: Conversation[];
  isLoading: boolean;
  onSelect: (conversationId: string) => void;
  onStartConversation: (userId: string) => void;
}

export function ConversationList({ conversations, isLoading, onSelect, onStartConversation }: Props) {
  const { query, setQuery, results, isSearching, clearSearch } = useUserSearch();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleResultClick = (userId: string) => {
    onStartConversation(userId);
    clearSearch();
  };

  return (
    <div ref={wrapperRef} className="flex h-full flex-col">
      {/* Search input */}
      <div className="relative shrink-0 border-b border-border px-3 py-2">
        <Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users..."
          className="w-full rounded-md border border-border bg-background/60 py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        {/* Search results dropdown */}
        {query.trim() && (
          <div className="absolute left-3 right-3 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
            {isSearching ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No users found</p>
            ) : (
              results.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleResultClick(user.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {user.display_username.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-foreground">{user.display_username}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Conversation list */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-disabled">Loading...</p>
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-sm text-muted-foreground">
            No conversations yet.
            <br />
            Search for a user above to start a DM.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {conversations.map((c) => {
            const lastMsgTime = c.last_message_at
              ? new Date(c.last_message_at).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                })
              : '';

            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left hover:bg-accent"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {c.other_username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">
                      {c.other_username}
                    </p>
                    {lastMsgTime && (
                      <span className="text-xs text-disabled">{lastMsgTime}</span>
                    )}
                  </div>
                  {c.last_message && (
                    <p className="truncate text-xs text-muted-foreground">
                      {c.last_message}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
