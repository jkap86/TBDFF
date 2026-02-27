export type TransactionType = 'trade' | 'waiver' | 'free_agent' | 'commissioner';
export type TransactionStatus = 'pending' | 'complete' | 'failed' | 'vetoed';
export type WaiverClaimStatus = 'pending' | 'successful' | 'outbid' | 'cancelled' | 'failed' | 'invalid';

export interface Transaction {
  id: string;
  league_id: string;
  type: TransactionType;
  status: TransactionStatus;
  week: number | null;
  roster_ids: number[];
  player_ids: string[];
  adds: Record<string, number>;
  drops: Record<string, number>;
  draft_pick_ids: string[];
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WaiverClaim {
  id: string;
  league_id: string;
  roster_id: number;
  user_id: string;
  player_id: string;
  drop_player_id: string | null;
  faab_amount: number;
  priority: number;
  status: WaiverClaimStatus;
  process_at: string | null;
  processed_at: string | null;
  transaction_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AddPlayerRequest {
  player_id: string;
  drop_player_id?: string;
}

export interface DropPlayerRequest {
  player_id: string;
}

export interface PlaceWaiverClaimRequest {
  player_id: string;
  drop_player_id?: string;
  faab_amount?: number;
}

export interface UpdateWaiverClaimRequest {
  drop_player_id?: string | null;
  faab_amount?: number;
}

export interface TransactionListResponse {
  transactions: Transaction[];
  total: number;
  limit: number;
  offset: number;
  player_names?: Record<string, string>;
}

export interface TransactionResponse {
  transaction: Transaction;
}

export interface WaiverClaimResponse {
  claim: WaiverClaim;
}

export interface WaiverClaimListResponse {
  claims: WaiverClaim[];
  player_names?: Record<string, string>;
}
