import { apiClient } from '../api/client';
import type {
  CreateDraftRequest,
  UpdateDraftRequest,
  SetDraftOrderRequest,
  MakeDraftPickRequest,
  NominateDraftPickRequest,
  PlaceBidRequest,
  SetDraftQueueRequest,
  AddToQueueRequest,
  UpdateQueueMaxBidRequest,
  DraftResponse,
  DraftListResponse,
  DraftPickResponse,
  DraftPickListResponse,
  ToggleAutoPickResponse,
  NominationResponse,
  BidResponse,
  DraftQueueResponse,
  AvailablePlayersResponse,
} from '../types/draft';

export const draftApi = {
  // League-scoped
  create: (leagueId: string, body: CreateDraftRequest, token: string) =>
    apiClient.post<DraftResponse>(`/leagues/${leagueId}/drafts`, body, token),

  getByLeague: (leagueId: string, token: string) =>
    apiClient.get<DraftListResponse>(`/leagues/${leagueId}/drafts`, token),

  // Draft-scoped
  getById: (draftId: string, token: string) =>
    apiClient.get<DraftResponse>(`/drafts/${draftId}`, token),

  update: (draftId: string, body: UpdateDraftRequest, token: string) =>
    apiClient.put<DraftResponse>(`/drafts/${draftId}`, body, token),

  setOrder: (draftId: string, body: SetDraftOrderRequest, token: string) =>
    apiClient.put<DraftResponse>(`/drafts/${draftId}/order`, body, token),

  start: (draftId: string, token: string) =>
    apiClient.post<DraftResponse>(`/drafts/${draftId}/start`, undefined, token),

  getPicks: (draftId: string, token: string) =>
    apiClient.get<DraftPickListResponse>(`/drafts/${draftId}/picks`, token),

  makePick: (draftId: string, body: MakeDraftPickRequest, token: string) =>
    apiClient.post<DraftPickResponse>(`/drafts/${draftId}/picks`, body, token),

  autoPick: (draftId: string, token: string) =>
    apiClient.post<DraftPickResponse>(`/drafts/${draftId}/autopick`, undefined, token),

  toggleAutoPick: (draftId: string, token: string) =>
    apiClient.post<ToggleAutoPickResponse>(`/drafts/${draftId}/autopick/toggle`, undefined, token),

  // Auction-specific
  nominate: (draftId: string, body: NominateDraftPickRequest, token: string) =>
    apiClient.post<NominationResponse>(`/drafts/${draftId}/nominate`, body, token),

  bid: (draftId: string, body: PlaceBidRequest, token: string) =>
    apiClient.post<BidResponse>(`/drafts/${draftId}/bid`, body, token),

  resolve: (draftId: string, token: string) =>
    apiClient.post<BidResponse>(`/drafts/${draftId}/resolve`, undefined, token),

  autoNominate: (draftId: string, token: string) =>
    apiClient.post<NominationResponse>(`/drafts/${draftId}/autonominate`, undefined, token),

  // Available players
  getAvailablePlayers: (draftId: string, token: string, params?: { position?: string; q?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.position) searchParams.set('position', params.position);
    if (params?.q) searchParams.set('q', params.q);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return apiClient.get<AvailablePlayersResponse>(`/drafts/${draftId}/available${query}`, token);
  },

  // Queue management
  getQueue: (draftId: string, token: string) =>
    apiClient.get<DraftQueueResponse>(`/drafts/${draftId}/queue`, token),

  setQueue: (draftId: string, body: SetDraftQueueRequest, token: string) =>
    apiClient.put<DraftQueueResponse>(`/drafts/${draftId}/queue`, body, token),

  addToQueue: (draftId: string, body: AddToQueueRequest, token: string) =>
    apiClient.post<DraftQueueResponse>(`/drafts/${draftId}/queue`, body, token),

  updateQueueMaxBid: (draftId: string, playerId: string, body: UpdateQueueMaxBidRequest, token: string) =>
    apiClient.patch<DraftQueueResponse>(`/drafts/${draftId}/queue/${playerId}`, body, token),

  removeFromQueue: (draftId: string, playerId: string, token: string) =>
    apiClient.delete<DraftQueueResponse>(`/drafts/${draftId}/queue/${playerId}`, token),
};
