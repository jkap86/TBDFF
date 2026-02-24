// Draft types (Sleeper-compatible)

export type DraftType = 'snake' | 'linear' | '3rr' | 'auction';
export type DraftStatus = 'pre_draft' | 'drafting' | 'complete';

// Draft settings (Sleeper-compatible, all integer values)
export interface DraftSettings {
  teams: number;
  rounds: number;
  pick_timer: number;
  nomination_timer: number;
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
  [key: string]: number;
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
  metadata: Record<string, any>;
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
