export type DraftType = 'snake' | 'linear' | '3rr' | 'auction';
export type DraftStatus = 'pre_draft' | 'drafting' | 'complete';

export interface BidHistoryEntry {
  user_id: string;
  amount: number;
  timestamp: string;
  auto_bid?: boolean;
}

export interface NominationPlayerMetadata {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string;
  position?: string | null;
  team?: string | null;
  auction_value?: number | null;
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
  player_metadata: NominationPlayerMetadata;
}

export interface DraftMetadata {
  auto_pick_users?: string[];
  auction_budgets?: Record<string, number>;
  current_nomination?: AuctionNomination | null;
  nomination_deadline?: string | null;
  [key: string]: unknown;
}

export interface DraftSettings {
  teams: number;
  rounds: number;
  pick_timer: number;
  nomination_timer: number;
  offering_timer: number;
  reversal_round: number;
  player_type: number;
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

export const DEFAULT_DRAFT_SETTINGS: DraftSettings = {
  teams: 12,
  rounds: 15,
  pick_timer: 120,
  nomination_timer: 30,
  offering_timer: 120,
  reversal_round: 0,
  player_type: 0,
  cpu_autopick: 0,
  autostart: 0,
  autopause_enabled: 0,
  autopause_start_time: 0,
  autopause_end_time: 0,
  alpha_sort: 0,
  slots_qb: 1,
  slots_rb: 2,
  slots_wr: 2,
  slots_te: 1,
  slots_flex: 2,
  slots_super_flex: 1,
  slots_def: 1,
  slots_k: 1,
  slots_bn: 5,
  budget: 200,
};

export class Draft {
  constructor(
    public readonly id: string,
    public readonly leagueId: string,
    public readonly season: string,
    public readonly sport: string,
    public readonly status: DraftStatus,
    public readonly type: DraftType,
    public readonly startTime: Date | null,
    public readonly lastPicked: Date | null,
    public readonly draftOrder: Record<string, number>,
    public readonly slotToRosterId: Record<string, number>,
    public readonly settings: DraftSettings,
    public readonly metadata: DraftMetadata,
    public readonly createdBy: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static fromDatabase(row: any): Draft {
    return new Draft(
      row.id,
      row.league_id,
      row.season,
      row.sport,
      row.status,
      row.type,
      row.start_time,
      row.last_picked,
      row.draft_order ?? {},
      row.slot_to_roster_id ?? {},
      row.settings ?? DEFAULT_DRAFT_SETTINGS,
      row.metadata ?? {},
      row.created_by,
      row.created_at,
      row.updated_at,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      league_id: this.leagueId,
      season: this.season,
      sport: this.sport,
      status: this.status,
      type: this.type,
      start_time: this.startTime,
      last_picked: this.lastPicked,
      draft_order: this.draftOrder,
      slot_to_roster_id: this.slotToRosterId,
      settings: this.settings,
      metadata: this.metadata,
      created_by: this.createdBy,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}

export class DraftPick {
  constructor(
    public readonly id: string,
    public readonly draftId: string,
    public readonly playerId: string | null,
    public readonly pickedBy: string | null,
    public readonly rosterId: number,
    public readonly round: number,
    public readonly pickNo: number,
    public readonly draftSlot: number,
    public readonly isKeeper: boolean,
    public readonly amount: number | null,
    public readonly metadata: Record<string, any>,
    public readonly username: string | null,
    public readonly createdAt: Date,
  ) {}

  static fromDatabase(row: any): DraftPick {
    return new DraftPick(
      row.id,
      row.draft_id,
      row.player_id,
      row.picked_by,
      row.roster_id,
      row.round,
      row.pick_no,
      row.draft_slot,
      row.is_keeper ?? false,
      row.amount ?? null,
      row.metadata ?? {},
      row.username ?? null,
      row.created_at,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      draft_id: this.draftId,
      player_id: this.playerId,
      picked_by: this.pickedBy,
      roster_id: this.rosterId,
      round: this.round,
      pick_no: this.pickNo,
      draft_slot: this.draftSlot,
      is_keeper: this.isKeeper,
      amount: this.amount,
      metadata: this.metadata,
      username: this.username,
      created_at: this.createdAt,
    };
  }
}
