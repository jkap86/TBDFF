'use client';

import type { Conversation } from '@tbdff/shared';

interface Props {
  conversations: Conversation[];
  isLoading: boolean;
  onSelect: (conversationId: string) => void;
}

export function ConversationList({ conversations, isLoading, onSelect }: Props) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          No conversations yet.
          <br />
          Visit a league member&apos;s profile to start a DM.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
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
            className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {c.other_username.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {c.other_username}
                </p>
                {lastMsgTime && (
                  <span className="text-xs text-gray-400">{lastMsgTime}</span>
                )}
              </div>
              {c.last_message && (
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {c.last_message}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
