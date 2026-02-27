export type AuctionLotStatus = 'active' | 'won' | 'passed';

export interface SlowAuctionSettings {
  bidWindowSeconds: number;
  maxNominationsPerTeam: number;
  maxNominationsGlobal: number;
  dailyNominationLimit: number; // 0 = unlimited
  minBid: number;
  minIncrement: number;
  budget: number;
  maxPlayersPerTeam: number;
}

export class AuctionLot {
  constructor(
    public readonly id: string,
    public readonly draftId: string,
    public readonly playerId: string,
    public readonly nominatorRosterId: number,
    public readonly currentBid: number,
    public readonly currentBidderRosterId: number | null,
    public readonly bidCount: number,
    public readonly bidDeadline: Date,
    public readonly status: AuctionLotStatus,
    public readonly winningRosterId: number | null,
    public readonly winningBid: number | null,
    public readonly nominationDate: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static fromDatabase(row: any): AuctionLot {
    return new AuctionLot(
      row.id,
      row.draft_id,
      row.player_id,
      row.nominator_roster_id,
      row.current_bid,
      row.current_bidder_roster_id,
      row.bid_count,
      row.bid_deadline,
      row.status,
      row.winning_roster_id,
      row.winning_bid,
      row.nomination_date,
      row.created_at,
      row.updated_at,
    );
  }

  toSafeObject(myMaxBid?: number | null) {
    const obj: Record<string, any> = {
      id: this.id,
      draft_id: this.draftId,
      player_id: this.playerId,
      nominator_roster_id: this.nominatorRosterId,
      current_bid: this.currentBid,
      current_bidder_roster_id: this.currentBidderRosterId,
      bid_count: this.bidCount,
      bid_deadline: this.bidDeadline,
      status: this.status,
      winning_roster_id: this.winningRosterId,
      winning_bid: this.winningBid,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
    if (myMaxBid !== undefined) {
      obj.my_max_bid = myMaxBid;
    }
    return obj;
  }
}

export interface AuctionProxyBid {
  id: string;
  lotId: string;
  rosterId: number;
  maxBid: number;
  createdAt: Date;
  updatedAt: Date;
}

export function proxyBidFromDatabase(row: any): AuctionProxyBid {
  return {
    id: row.id,
    lotId: row.lot_id,
    rosterId: row.roster_id,
    maxBid: row.max_bid,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface AuctionBidHistory {
  id: string;
  lotId: string;
  rosterId: number;
  bidAmount: number;
  isProxy: boolean;
  username?: string;
  createdAt: Date;
}

export function bidHistoryFromDatabase(row: any): AuctionBidHistory {
  return {
    id: row.id,
    lotId: row.lot_id,
    rosterId: row.roster_id,
    bidAmount: row.bid_amount,
    isProxy: row.is_proxy,
    username: row.username ?? undefined,
    createdAt: row.created_at,
  };
}

export interface RosterBudgetData {
  rosterId: number;
  spent: number;
  wonCount: number;
  leadingCommitment: number;
}
