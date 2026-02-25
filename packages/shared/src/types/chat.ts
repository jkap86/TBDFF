export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_username: string;
  league_id: string | null;
  conversation_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_a_id: string;
  user_b_id: string;
  other_username: string;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageListResponse {
  messages: ChatMessage[];
  limit: number;
  before: string | null;
}

export interface ConversationResponse {
  conversation: Conversation;
}

export interface ConversationListResponse {
  conversations: Conversation[];
}

// Socket.IO event payload types
export interface ChatSendPayload {
  type: 'league' | 'dm';
  roomId: string;
  content: string;
}

export interface ChatJoinedEvent {
  type: string;
  roomId: string;
}

export interface ChatErrorEvent {
  message: string;
}
