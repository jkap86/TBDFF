import { apiClient } from '../api/client';
import type {
  PaymentListResponse,
  PaymentResponse,
  RecordBuyInRequest,
  RecordPayoutRequest,
  SetBuyInRequest,
} from '../types/payment';

export const paymentApi = {
  getPayments: (leagueId: string, token: string) =>
    apiClient.get<PaymentListResponse>(`/leagues/${leagueId}/payments`, token),

  setBuyIn: (leagueId: string, data: SetBuyInRequest, token: string) =>
    apiClient.put<{ message: string }>(`/leagues/${leagueId}/payments/buy-in`, data, token),

  recordBuyIn: (leagueId: string, data: RecordBuyInRequest, token: string) =>
    apiClient.post<PaymentResponse>(`/leagues/${leagueId}/payments/buy-ins`, data, token),

  recordPayout: (leagueId: string, data: RecordPayoutRequest, token: string) =>
    apiClient.post<PaymentResponse>(`/leagues/${leagueId}/payments/payouts`, data, token),

  removePayment: (leagueId: string, paymentId: string, token: string) =>
    apiClient.delete<{ message: string }>(`/leagues/${leagueId}/payments/${paymentId}`, token),
};
