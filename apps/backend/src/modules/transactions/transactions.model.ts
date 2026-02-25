export type TransactionType = 'trade' | 'waiver' | 'free_agent' | 'commissioner';
export type TransactionStatus = 'pending' | 'complete' | 'failed' | 'vetoed';
export type WaiverClaimStatus = 'pending' | 'successful' | 'outbid' | 'cancelled' | 'failed' | 'invalid';

export class Transaction {
  constructor(
    public readonly id: string,
    public readonly leagueId: string,
    public readonly type: TransactionType,
    public readonly status: TransactionStatus,
    public readonly week: number | null,
    public readonly rosterIds: number[],
    public readonly playerIds: string[],
    public readonly adds: Record<string, number>,
    public readonly drops: Record<string, number>,
    public readonly draftPickIds: string[],
    public readonly settings: Record<string, unknown>,
    public readonly metadata: Record<string, unknown>,
    public readonly createdBy: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static fromDatabase(row: any): Transaction {
    return new Transaction(
      row.id,
      row.league_id,
      row.type,
      row.status,
      row.week,
      row.roster_ids ?? [],
      row.player_ids ?? [],
      row.adds ?? {},
      row.drops ?? {},
      row.draft_pick_ids ?? [],
      row.settings ?? {},
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
      type: this.type,
      status: this.status,
      week: this.week,
      roster_ids: this.rosterIds,
      player_ids: this.playerIds,
      adds: this.adds,
      drops: this.drops,
      draft_pick_ids: this.draftPickIds,
      settings: this.settings,
      metadata: this.metadata,
      created_by: this.createdBy,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}

export class WaiverClaim {
  constructor(
    public readonly id: string,
    public readonly leagueId: string,
    public readonly rosterId: number,
    public readonly userId: string,
    public readonly playerId: string,
    public readonly dropPlayerId: string | null,
    public readonly faabAmount: number,
    public readonly priority: number,
    public readonly status: WaiverClaimStatus,
    public readonly processAt: Date | null,
    public readonly processedAt: Date | null,
    public readonly transactionId: string | null,
    public readonly metadata: Record<string, unknown>,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static fromDatabase(row: any): WaiverClaim {
    return new WaiverClaim(
      row.id,
      row.league_id,
      row.roster_id,
      row.user_id,
      row.player_id,
      row.drop_player_id,
      row.faab_amount,
      row.priority,
      row.status,
      row.process_at,
      row.processed_at,
      row.transaction_id,
      row.metadata ?? {},
      row.created_at,
      row.updated_at,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      league_id: this.leagueId,
      roster_id: this.rosterId,
      user_id: this.userId,
      player_id: this.playerId,
      drop_player_id: this.dropPlayerId,
      faab_amount: this.faabAmount,
      priority: this.priority,
      status: this.status,
      process_at: this.processAt,
      processed_at: this.processedAt,
      transaction_id: this.transactionId,
      metadata: this.metadata,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}

export class PlayerWaiver {
  constructor(
    public readonly id: string,
    public readonly leagueId: string,
    public readonly playerId: string,
    public readonly droppedBy: string | null,
    public readonly waiverExpires: Date,
    public readonly createdAt: Date,
  ) {}

  static fromDatabase(row: any): PlayerWaiver {
    return new PlayerWaiver(
      row.id,
      row.league_id,
      row.player_id,
      row.dropped_by,
      row.waiver_expires,
      row.created_at,
    );
  }
}
