export type PaymentType = 'buy_in' | 'payout';

export interface LeaguePayment {
  id: string;
  league_id: string;
  user_id: string;
  type: PaymentType;
  amount: number;
  note: string | null;
  recorded_by: string;
  created_at: string;
  updated_at: string;
  username?: string;
  recorded_by_username?: string;
}

export interface PaymentListResponse {
  payments: LeaguePayment[];
}

export interface PaymentResponse {
  payment: LeaguePayment;
}

export interface RecordBuyInRequest {
  user_id: string;
  amount: number;
}

export interface RecordPayoutRequest {
  user_id: string;
  amount: number;
  note?: string;
}

export interface SetBuyInRequest {
  buy_in: number;
}
