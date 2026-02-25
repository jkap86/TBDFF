import { apiClient } from '../api/client';
import type {
  TradeProposalResponse,
  TradeListResponse,
  FutureDraftPickListResponse,
  ProposeTradeRequest,
  CounterTradeRequest,
} from '../types/trade';

export const tradeApi = {
  propose: (leagueId: string, data: ProposeTradeRequest, token: string) =>
    apiClient.post<TradeProposalResponse>(`/leagues/${leagueId}/trades`, data, token),

  list: (leagueId: string, token: string, params?: { status?: string }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    const q = search.toString() ? `?${search.toString()}` : '';
    return apiClient.get<TradeListResponse>(`/leagues/${leagueId}/trades${q}`, token);
  },

  getById: (tradeId: string, token: string) =>
    apiClient.get<TradeProposalResponse>(`/trades/${tradeId}`, token),

  accept: (tradeId: string, token: string) =>
    apiClient.post<TradeProposalResponse>(`/trades/${tradeId}/accept`, {}, token),

  decline: (tradeId: string, token: string) =>
    apiClient.post<TradeProposalResponse>(`/trades/${tradeId}/decline`, {}, token),

  withdraw: (tradeId: string, token: string) =>
    apiClient.post<TradeProposalResponse>(`/trades/${tradeId}/withdraw`, {}, token),

  counter: (tradeId: string, data: CounterTradeRequest, token: string) =>
    apiClient.post<TradeProposalResponse>(`/trades/${tradeId}/counter`, data, token),

  veto: (tradeId: string, token: string) =>
    apiClient.post<TradeProposalResponse>(`/trades/${tradeId}/veto`, {}, token),

  push: (tradeId: string, token: string) =>
    apiClient.post<TradeProposalResponse>(`/trades/${tradeId}/push`, {}, token),

  getFuturePicks: (leagueId: string, token: string) =>
    apiClient.get<FutureDraftPickListResponse>(`/leagues/${leagueId}/future-picks`, token),

  getUserFuturePicks: (leagueId: string, userId: string, token: string) =>
    apiClient.get<FutureDraftPickListResponse>(`/leagues/${leagueId}/future-picks/${userId}`, token),
};
