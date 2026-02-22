import { apiClient } from '../api/client';
import type {
  CreateLeagueRequest,
  UpdateLeagueRequest,
  LeagueResponse,
  LeagueListResponse,
  LeagueMembersResponse,
  LeagueMemberResponse,
  CreateInviteRequest,
  InviteResponse,
  InviteListResponse,
  PublicLeaguesResponse,
  RosterListResponse,
} from '../types/league';

export const leagueApi = {
  create: (body: CreateLeagueRequest, token: string) =>
    apiClient.post<LeagueResponse>('/leagues', body, token),

  getMyLeagues: (token: string) =>
    apiClient.get<LeagueListResponse>('/leagues', token),

  getById: (leagueId: string, token: string) =>
    apiClient.get<LeagueResponse>(`/leagues/${leagueId}`, token),

  update: (leagueId: string, body: UpdateLeagueRequest, token: string) =>
    apiClient.put<LeagueResponse>(`/leagues/${leagueId}`, body, token),

  delete: (leagueId: string, token: string) =>
    apiClient.delete<{ message: string }>(`/leagues/${leagueId}`, token),

  // Members
  getMembers: (leagueId: string, token: string) =>
    apiClient.get<LeagueMembersResponse>(`/leagues/${leagueId}/members`, token),

  join: (leagueId: string, token: string) =>
    apiClient.post<LeagueMemberResponse>(`/leagues/${leagueId}/members`, undefined, token),

  leave: (leagueId: string, token: string) =>
    apiClient.delete<{ message: string }>(`/leagues/${leagueId}/members/me`, token),

  removeMember: (leagueId: string, userId: string, token: string) =>
    apiClient.delete<{ message: string }>(`/leagues/${leagueId}/members/${userId}`, token),

  updateMemberRole: (leagueId: string, userId: string, role: string, token: string) =>
    apiClient.put<LeagueMemberResponse>(`/leagues/${leagueId}/members/${userId}`, { role }, token),

  // Rosters
  getRosters: (leagueId: string, token: string) =>
    apiClient.get<RosterListResponse>(`/leagues/${leagueId}/rosters`, token),

  // Public leagues (no auth required)
  getPublicLeagues: (limit = 20, offset = 0) =>
    apiClient.get<PublicLeaguesResponse>(`/leagues/public?limit=${limit}&offset=${offset}`),

  // Invites (league-scoped)
  createInvite: (leagueId: string, body: CreateInviteRequest, token: string) =>
    apiClient.post<InviteResponse>(`/leagues/${leagueId}/invites`, body, token),

  getLeagueInvites: (leagueId: string, token: string) =>
    apiClient.get<InviteListResponse>(`/leagues/${leagueId}/invites`, token),

  // Invites (user-scoped)
  getMyInvites: (token: string) =>
    apiClient.get<InviteListResponse>('/invites/pending', token),

  acceptInvite: (inviteId: string, token: string) =>
    apiClient.post<LeagueMemberResponse>(`/invites/${inviteId}/accept`, undefined, token),

  declineInvite: (inviteId: string, token: string) =>
    apiClient.delete<{ message: string }>(`/invites/${inviteId}`, token),
};
