export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'review' | 'vetoed' | 'completed' | 'countered' | 'expired';
export type TradeItemSide = 'proposer' | 'receiver';
export type TradeItemType = 'player' | 'draft_pick' | 'faab';

export class TradeProposal {
  constructor(
    public readonly id: string,
    public readonly leagueId: string,
    public readonly status: TradeStatus,
    public readonly proposedBy: string,
    public readonly proposedTo: string,
    public readonly week: number | null,
    public readonly message: string | null,
    public readonly reviewExpiresAt: Date | null,
    public readonly transactionId: string | null,
    public readonly metadata: Record<string, unknown>,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly items: TradeItem[] = [],
    public readonly proposedByUsername?: string,
    public readonly proposedToUsername?: string,
  ) {}

  static fromDatabase(row: any, items: TradeItem[] = []): TradeProposal {
    return new TradeProposal(
      row.id,
      row.league_id,
      row.status,
      row.proposed_by,
      row.proposed_to,
      row.week,
      row.message,
      row.review_expires_at,
      row.transaction_id,
      row.metadata ?? {},
      row.created_at,
      row.updated_at,
      items,
      row.proposed_by_username,
      row.proposed_to_username,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      league_id: this.leagueId,
      status: this.status,
      proposed_by: this.proposedBy,
      proposed_to: this.proposedTo,
      week: this.week,
      message: this.message,
      review_expires_at: this.reviewExpiresAt,
      transaction_id: this.transactionId,
      metadata: this.metadata,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
      items: this.items.map((i) => i.toSafeObject()),
      proposed_by_username: this.proposedByUsername,
      proposed_to_username: this.proposedToUsername,
    };
  }
}

export class TradeItem {
  constructor(
    public readonly id: string,
    public readonly tradeId: string,
    public readonly side: TradeItemSide,
    public readonly itemType: TradeItemType,
    public readonly playerId: string | null,
    public readonly draftPickId: string | null,
    public readonly faabAmount: number | null,
    public readonly rosterId: number,
  ) {}

  static fromDatabase(row: any): TradeItem {
    return new TradeItem(
      row.id,
      row.trade_id,
      row.side,
      row.item_type,
      row.player_id,
      row.draft_pick_id,
      row.faab_amount,
      row.roster_id,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      trade_id: this.tradeId,
      side: this.side,
      item_type: this.itemType,
      player_id: this.playerId,
      draft_pick_id: this.draftPickId,
      faab_amount: this.faabAmount,
      roster_id: this.rosterId,
    };
  }
}

export class FutureDraftPick {
  public pickNumber?: number;

  constructor(
    public readonly id: string,
    public readonly leagueId: string,
    public readonly season: string,
    public readonly round: number,
    public readonly originalOwnerId: string,
    public readonly currentOwnerId: string,
    public readonly rosterId: number,
    public readonly metadata: Record<string, unknown>,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly originalOwnerUsername?: string,
    public readonly currentOwnerUsername?: string,
  ) {}

  static fromDatabase(row: any): FutureDraftPick {
    return new FutureDraftPick(
      row.id,
      row.league_id,
      row.season,
      row.round,
      row.original_owner_id,
      row.current_owner_id,
      row.roster_id,
      row.metadata ?? {},
      row.created_at,
      row.updated_at,
      row.original_owner_username,
      row.current_owner_username,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      league_id: this.leagueId,
      season: this.season,
      round: this.round,
      original_owner_id: this.originalOwnerId,
      current_owner_id: this.currentOwnerId,
      roster_id: this.rosterId,
      metadata: this.metadata,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
      original_owner_username: this.originalOwnerUsername,
      current_owner_username: this.currentOwnerUsername,
      pick_number: this.pickNumber,
    };
  }
}
