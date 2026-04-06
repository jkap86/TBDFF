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
  const {
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
  } = useDMChat(conversationId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-disabled">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-destructive-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <MessageList
          messages={messages}
          currentUserId={user?.id ?? ''}
          onLoadMore={loadMore}
          hasMore={hasMore}
          typingUsers={typingUsers}
          onJumpToDate={jumpToDate}
        />
      </div>
      <MessageInput
        onSend={send}
        onTyping={handleTyping}
        connectionStatus={connectionStatus}
        socketError={socketError}
      />
    </div>
  );
}
