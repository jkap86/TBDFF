export type PaymentType = 'buy_in' | 'payout';
export type PayoutCategory = 'place' | 'points';

export interface LeaguePayment {
  id: string;
  league_id: string;
  user_id: string;
  type: PaymentType;
  amount: number;
  note: string | null;
  category: PayoutCategory | null;
  recorded_by: string;
  created_at: string;
  updated_at: string;
  username?: string;
  recorded_by_username?: string;
}

export interface PayoutEntry {
  category: PayoutCategory;
  position: number;
  value: number;
  is_percentage: boolean;
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

export interface SetBuyInRequest {
  buy_in: number;
}

export interface SetPayoutsRequest {
  payouts: PayoutEntry[];
}
