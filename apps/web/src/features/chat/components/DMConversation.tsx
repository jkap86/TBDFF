'use client';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { useDMChat } from '../hooks/useDMChat';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

interface Props {
  conversationId: string;
}

export function DMConversation({ conversationId }: Props) {
  const { user } = useAuth();
  const { messages, isLoading, error, hasMore, send, loadMore } = useDMChat(conversationId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <MessageList
          messages={messages}
          currentUserId={user?.id ?? ''}
          onLoadMore={loadMore}
          hasMore={hasMore}
        />
      </div>
      <MessageInput onSend={send} />
    </div>
  );
}
