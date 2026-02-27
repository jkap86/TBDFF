// Draft types (Sleeper-compatible)

export type DraftType = 'snake' | 'linear' | '3rr' | 'auction' | 'slow_auction';
export type DraftStatus = 'pre_draft' | 'drafting' | 'complete';

// Draft settings (Sleeper-compatible, all integer values)
export interface DraftSettings {
  teams: number;
  rounds: number;
  pick_timer: number;
  nomination_timer: number;
  offering_timer: number;
  reversal_round: number;
  player_type: number; // 0=all, 1=rookies only
  cpu_autopick: number;
  autostart: number;
  autopause_enabled: number;
  autopause_start_time: number;
  autopause_end_time: number;
  alpha_sort: number;
  slots_qb: number;
  slots_rb: number;
  slots_wr: number;
  slots_te: number;
  slots_flex: number;
  slots_super_flex: number;
  slots_def: number;
  slots_k: number;
  slots_bn: number;
  budget: number;
  max_players_per_team: number;
  // Slow auction settings
  bid_window_seconds: number;
  max_nominations_per_team: number;
  max_nominations_global: number;
  daily_nomination_limit: number;
  min_bid: number;
  min_increment: number;
  [key: string]: number;
}

// Auction nomination metadata
export interface BidHistoryEntry {
  user_id: string;
  amount: number;
  timestamp: string;
  auto_bid?: boolean;
}

export interface AuctionNomination {
  pick_id: string;
  player_id: string;
  nominated_by: string;
  current_bid: number;
  current_bidder: string;
  bidder_roster_id: number;
  bid_deadline: string;
  bid_history: BidHistoryEntry[];
  player_metadata: Record<string, unknown>;
}

export interface DraftMetadata {
  auto_pick_users?: string[];
  auction_budgets?: Record<string, number>;
  current_nomination?: AuctionNomination | null;
  nomination_deadline?: string | null;
  [key: string]: unknown;
}

// Draft entity
export interface Draft {
  id: string;
  league_id: string;
  season: string;
  sport: string;
  status: DraftStatus;
  type: DraftType;
  start_time: string | null;
  last_picked: string | null;
  draft_order: Record<string, number>; // user_id -> draft_slot
  slot_to_roster_id: Record<string, number>; // draft_slot -> roster_id
  settings: DraftSettings;
  metadata: DraftMetadata;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Draft pick entity
export interface DraftPick {
  id: string;
  draft_id: string;
  player_id: string | null;
  picked_by: string | null;
  roster_id: number;
  round: number;
  pick_no: number;
  draft_slot: number;
  is_keeper: boolean;
  amount: number | null;
  metadata: Record<string, any>;
  username: string | null; // joined from users table
  created_at: string;
}

// Request types
export interface CreateDraftRequest {
  type?: DraftType;
  settings?: Partial<DraftSettings>;
}

export interface UpdateDraftRequest {
  type?: DraftType;
  start_time?: string | null;
  settings?: Partial<DraftSettings>;
  metadata?: Record<string, any>;
}

export interface SetDraftOrderRequest {
  draft_order: Record<string, number>;
  slot_to_roster_id: Record<string, number>;
}

export interface MakeDraftPickRequest {
  player_id: string;
}

// Auction-specific request types
export interface NominateDraftPickRequest {
  player_id: string;
  amount: number;
}

export interface PlaceBidRequest {
  amount: number;
}

// Response types
export interface DraftResponse {
  draft: Draft;
}

export interface DraftListResponse {
  drafts: Draft[];
}

export interface DraftPickResponse {
  pick: DraftPick;
  chained_picks?: DraftPick[];
}

export interface DraftPickListResponse {
  picks: DraftPick[];
}

export interface ToggleAutoPickResponse {
  draft: Draft;
  picks: DraftPick[];
}

// Auction-specific response types
export interface NominationResponse {
  draft: Draft;
}

export interface BidResponse {
  draft: Draft;
  won: DraftPick | null;
}

// Draft queue types
export interface DraftQueueItem {
  player_id: string;
  rank: number;
  max_bid: number | null;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  team: string | null;
  search_rank: number | null;
  auction_value: number | null;
}

export interface SetDraftQueueRequest {
  player_ids: string[];
}

export interface AddToQueueRequest {
  player_id: string;
  max_bid?: number | null;
}

export interface UpdateQueueMaxBidRequest {
  max_bid: number | null;
}

export interface DraftQueueResponse {
  queue: DraftQueueItem[];
}

export interface AvailablePlayersResponse {
  players: import('./player').Player[];
}

// ---- Slow Auction Types ----

export type AuctionLotStatus = 'active' | 'won' | 'passed';

export interface AuctionLot {
  id: string;
  draft_id: string;
  player_id: string;
  nominator_roster_id: number;
  current_bid: number;
  current_bidder_roster_id: number | null;
  bid_count: number;
  bid_deadline: string;
  status: AuctionLotStatus;
  winning_roster_id: number | null;
  winning_bid: number | null;
  my_max_bid?: number | null;
  player_metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AuctionBidHistoryEntry {
  id: string;
  lot_id: string;
  roster_id: number;
  username?: string;
  bid_amount: number;
  is_proxy: boolean;
  created_at: string;
}

export interface RosterBudget {
  roster_id: number;
  username: string;
  total_budget: number;
  spent: number;
  leading_commitment: number;
  available: number;
  won_count: number;
  total_slots: number;
}

// Slow auction request types
export interface SlowNominateRequest {
  player_id: string;
}

export interface SetMaxBidRequest {
  max_bid: number;
}

// Slow auction response types
export interface SlowAuctionLotsResponse {
  lots: AuctionLot[];
}

export interface SlowNominateResponse {
  lot: AuctionLot;
}

export interface SetMaxBidResponse {
  lot: AuctionLot;
}

export interface SlowAuctionBudgetsResponse {
  budgets: RosterBudget[];
}

export interface SlowAuctionBidHistoryResponse {
  history: AuctionBidHistoryEntry[];
}

export interface NominationStatsResponse {
  active_nominations: number;
  max_per_team: number;
  global_active: number;
  max_global: number;
  daily_used: number;
  daily_limit: number;
}
