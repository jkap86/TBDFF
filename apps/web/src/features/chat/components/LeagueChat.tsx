'use client';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { useLeagueChat } from '../hooks/useLeagueChat';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

interface Props {
  leagueId: string;
}

export function LeagueChat({ leagueId }: Props) {
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
  } = useLeagueChat(leagueId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-disabled">Loading chat...</p>
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
        placeholder="Message the league..."
        connectionStatus={connectionStatus}
        socketError={socketError}
      />
    </div>
  );
}
