export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'review' | 'vetoed' | 'completed' | 'countered' | 'expired';
export type TradeItemSide = 'proposer' | 'receiver';
export type TradeItemType = 'player' | 'draft_pick' | 'faab';

export interface TradeProposal {
  id: string;
  league_id: string;
  status: TradeStatus;
  proposed_by: string;
  proposed_to: string;
  week: number | null;
  message: string | null;
  review_expires_at: string | null;
  transaction_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  items?: TradeItem[];
  proposed_by_username?: string;
  proposed_to_username?: string;
}

export interface TradeItem {
  id: string;
  trade_id: string;
  side: TradeItemSide;
  item_type: TradeItemType;
  player_id: string | null;
  draft_pick_id: string | null;
  faab_amount: number | null;
  roster_id: number;
}

export interface FutureDraftPick {
  id: string;
  league_id: string;
  season: string;
  round: number;
  original_owner_id: string;
  current_owner_id: string;
  roster_id: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  original_owner_username?: string;
  current_owner_username?: string;
}

export interface ProposeTradeRequest {
  proposed_to: string;
  message?: string;
  items: Array<{
    side: TradeItemSide;
    item_type: TradeItemType;
    player_id?: string;
    draft_pick_id?: string;
    faab_amount?: number;
    roster_id: number;
  }>;
}

export interface CounterTradeRequest {
  message?: string;
  items: Array<{
    side: TradeItemSide;
    item_type: TradeItemType;
    player_id?: string;
    draft_pick_id?: string;
    faab_amount?: number;
    roster_id: number;
  }>;
}

export interface TradeProposalResponse {
  trade: TradeProposal;
}

export interface TradeListResponse {
  trades: TradeProposal[];
}

export interface FutureDraftPickListResponse {
  picks: FutureDraftPick[];
}
