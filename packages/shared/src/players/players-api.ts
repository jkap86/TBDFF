import { apiClient } from '../api/client';
import { PlayerResponse, PlayersListResponse } from '../types/player';

export const playerApi = {
  getAll: (token: string, limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (offset) params.set('offset', offset.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<PlayersListResponse>(`/players${query}`, token);
  },

  getById: (id: string, token: string) =>
    apiClient.get<PlayerResponse>(`/players/${id}`, token),

  search: (query: string, token: string, limit?: number) => {
    const params = new URLSearchParams({ q: query });
    if (limit) params.set('limit', limit.toString());
    return apiClient.get<PlayersListResponse>(`/players/search?${params.toString()}`, token);
  },

  getByPosition: (position: string, token: string) =>
    apiClient.get<PlayersListResponse>(`/players/position/${position}`, token),

  getByTeam: (team: string, token: string) =>
    apiClient.get<PlayersListResponse>(`/players/team/${team}`, token),
};
