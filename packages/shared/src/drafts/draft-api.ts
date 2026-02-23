import { apiClient } from '../api/client';
import type {
  CreateDraftRequest,
  UpdateDraftRequest,
  SetDraftOrderRequest,
  MakeDraftPickRequest,
  DraftResponse,
  DraftListResponse,
  DraftPickResponse,
  DraftPickListResponse,
  ToggleAutoPickResponse,
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
};
