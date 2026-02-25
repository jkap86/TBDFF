import { apiClient } from '../api/client';
import type {
  TransactionListResponse,
  TransactionResponse,
  WaiverClaimResponse,
  WaiverClaimListResponse,
  AddPlayerRequest,
  DropPlayerRequest,
  PlaceWaiverClaimRequest,
  UpdateWaiverClaimRequest,
} from '../types/transaction';

export const transactionApi = {
  list: (leagueId: string, token: string, params?: { type?: string; limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.type) search.set('type', params.type);
    if (params?.limit !== undefined) search.set('limit', params.limit.toString());
    if (params?.offset !== undefined) search.set('offset', params.offset.toString());
    const q = search.toString() ? `?${search.toString()}` : '';
    return apiClient.get<TransactionListResponse>(`/leagues/${leagueId}/transactions${q}`, token);
  },

  addPlayer: (leagueId: string, data: AddPlayerRequest, token: string) =>
    apiClient.post<TransactionResponse>(`/leagues/${leagueId}/add`, data, token),

  dropPlayer: (leagueId: string, data: DropPlayerRequest, token: string) =>
    apiClient.post<TransactionResponse>(`/leagues/${leagueId}/drop`, data, token),

  getWaiverClaims: (leagueId: string, token: string) =>
    apiClient.get<WaiverClaimListResponse>(`/leagues/${leagueId}/waivers`, token),

  placeWaiverClaim: (leagueId: string, data: PlaceWaiverClaimRequest, token: string) =>
    apiClient.post<WaiverClaimResponse>(`/leagues/${leagueId}/waivers`, data, token),

  updateWaiverClaim: (leagueId: string, claimId: string, data: UpdateWaiverClaimRequest, token: string) =>
    apiClient.put<WaiverClaimResponse>(`/leagues/${leagueId}/waivers/${claimId}`, data, token),

  cancelWaiverClaim: (leagueId: string, claimId: string, token: string) =>
    apiClient.delete<void>(`/leagues/${leagueId}/waivers/${claimId}`, token),
};
