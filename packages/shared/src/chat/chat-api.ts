import { apiClient } from '../api/client';
import type {
  MessageListResponse,
  ConversationListResponse,
  ConversationResponse,
} from '../types/chat';
import type { UserSearchResponse } from '../types/auth';

export const chatApi = {
  getLeagueMessages: (
    leagueId: string,
    token: string,
    params?: { limit?: number; before?: string; after?: string },
  ) => {
    const search = new URLSearchParams();
    if (params?.limit !== undefined) search.set('limit', params.limit.toString());
    if (params?.before) search.set('before', params.before);
    if (params?.after) search.set('after', params.after);
    const q = search.toString() ? `?${search.toString()}` : '';
    return apiClient.get<MessageListResponse>(`/leagues/${leagueId}/chat/messages${q}`, token);
  },

  getMyConversations: (token: string) =>
    apiClient.get<ConversationListResponse>('/conversations', token),

  startConversation: (userId: string, token: string) =>
    apiClient.post<ConversationResponse>('/conversations', { user_id: userId }, token),

  getConversationMessages: (
    conversationId: string,
    token: string,
    params?: { limit?: number; before?: string; after?: string },
  ) => {
    const search = new URLSearchParams();
    if (params?.limit !== undefined) search.set('limit', params.limit.toString());
    if (params?.before) search.set('before', params.before);
    if (params?.after) search.set('after', params.after);
    const q = search.toString() ? `?${search.toString()}` : '';
    return apiClient.get<MessageListResponse>(`/conversations/${conversationId}/messages${q}`, token);
  },

  searchUsers: (query: string, token: string, limit?: number) => {
    const search = new URLSearchParams({ q: query });
    if (limit !== undefined) search.set('limit', limit.toString());
    return apiClient.get<UserSearchResponse>(`/auth/users/search?${search.toString()}`, token);
  },
};
