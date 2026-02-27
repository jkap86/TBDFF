import { Pool, PoolClient } from 'pg';
import { AuctionLot, AuctionProxyBid, AuctionBidHistory, RosterBudgetData, proxyBidFromDatabase, bidHistoryFromDatabase } from './slow-auction.model';

export class AuctionLotRepository {
  constructor(private readonly db: Pool) {}

  // ---- Lots ----

  async createLot(
    data: {
      draftId: string;
      playerId: string;
      nominatorRosterId: number;
      currentBid: number;
      bidDeadline: Date;
      nominationDate: string;
    },
    client?: PoolClient,
  ): Promise<AuctionLot> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `INSERT INTO auction_lots (draft_id, player_id, nominator_roster_id, current_bid, bid_deadline, nomination_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING *`,
      [data.draftId, data.playerId, data.nominatorRosterId, data.currentBid, data.bidDeadline, data.nominationDate],
    );
    return AuctionLot.fromDatabase(result.rows[0]);
  }

  async findLotById(lotId: string, client?: PoolClient): Promise<AuctionLot | null> {
    const conn = client ?? this.db;
    const result = await conn.query('SELECT * FROM auction_lots WHERE id = $1', [lotId]);
    return result.rows.length > 0 ? AuctionLot.fromDatabase(result.rows[0]) : null;
  }

  async findLotByIdForUpdate(lotId: string, client: PoolClient): Promise<AuctionLot | null> {
    const result = await client.query('SELECT * FROM auction_lots WHERE id = $1 FOR UPDATE', [lotId]);
    return result.rows.length > 0 ? AuctionLot.fromDatabase(result.rows[0]) : null;
  }

  async findActiveLotsByDraft(draftId: string): Promise<AuctionLot[]> {
    const result = await this.db.query(
      `SELECT * FROM auction_lots WHERE draft_id = $1 AND status = 'active' ORDER BY bid_deadline ASC`,
      [draftId],
    );
    return result.rows.map(AuctionLot.fromDatabase);
  }

  async findLotsByDraft(draftId: string, status?: string): Promise<AuctionLot[]> {
    if (status && status !== 'all') {
      const result = await this.db.query(
        `SELECT * FROM auction_lots WHERE draft_id = $1 AND status = $2 ORDER BY created_at DESC`,
        [draftId, status],
      );
      return result.rows.map(AuctionLot.fromDatabase);
    }
    const result = await this.db.query(
      `SELECT * FROM auction_lots WHERE draft_id = $1 ORDER BY created_at DESC`,
      [draftId],
    );
    return result.rows.map(AuctionLot.fromDatabase);
  }

  async findExpiredLots(): Promise<AuctionLot[]> {
    const result = await this.db.query(
      `SELECT * FROM auction_lots WHERE status = 'active' AND bid_deadline < NOW()`,
    );
    return result.rows.map(AuctionLot.fromDatabase);
  }

  async isPlayerNominatedOrWon(draftId: string, playerId: string, client?: PoolClient): Promise<boolean> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `SELECT 1 FROM auction_lots WHERE draft_id = $1 AND player_id = $2 AND status IN ('active', 'won') LIMIT 1`,
      [draftId, playerId],
    );
    return result.rows.length > 0;
  }

  /**
   * CAS update: only succeeds if current_bid and current_bidder_roster_id match expected values.
   * Returns the updated lot or null if CAS failed (concurrent modification).
   */
  async updateLotWithCAS(
    lotId: string,
    update: {
      currentBid: number;
      currentBidderRosterId: number;
      bidCount: number;
      bidDeadline?: Date;
    },
    expected: {
      currentBid: number;
      currentBidderRosterId: number | null;
    },
    client: PoolClient,
  ): Promise<AuctionLot | null> {
    if (update.bidDeadline) {
      const result = await client.query(
        `UPDATE auction_lots
         SET current_bid = $1, current_bidder_roster_id = $2, bid_count = $3, bid_deadline = $4
         WHERE id = $5
           AND current_bid = $6
           AND current_bidder_roster_id IS NOT DISTINCT FROM $7
           AND status = 'active'
         RETURNING *`,
        [update.currentBid, update.currentBidderRosterId, update.bidCount, update.bidDeadline,
         lotId, expected.currentBid, expected.currentBidderRosterId],
      );
      return result.rows.length > 0 ? AuctionLot.fromDatabase(result.rows[0]) : null;
    }

    const result = await client.query(
      `UPDATE auction_lots
       SET current_bid = $1, current_bidder_roster_id = $2, bid_count = $3
       WHERE id = $4
         AND current_bid = $5
         AND current_bidder_roster_id IS NOT DISTINCT FROM $6
         AND status = 'active'
       RETURNING *`,
      [update.currentBid, update.currentBidderRosterId, update.bidCount,
       lotId, expected.currentBid, expected.currentBidderRosterId],
    );
    return result.rows.length > 0 ? AuctionLot.fromDatabase(result.rows[0]) : null;
  }

  async settleLotWon(
    lotId: string,
    winnerRosterId: number,
    winningBid: number,
    client: PoolClient,
  ): Promise<AuctionLot | null> {
    const result = await client.query(
      `UPDATE auction_lots
       SET status = 'won', winning_roster_id = $2, winning_bid = $3,
           current_bidder_roster_id = $2, current_bid = $3
       WHERE id = $1 AND status = 'active'
       RETURNING *`,
      [lotId, winnerRosterId, winningBid],
    );
    return result.rows.length > 0 ? AuctionLot.fromDatabase(result.rows[0]) : null;
  }

  async settleLotPassed(lotId: string, client: PoolClient): Promise<AuctionLot | null> {
    const result = await client.query(
      `UPDATE auction_lots SET status = 'passed' WHERE id = $1 AND status = 'active' RETURNING *`,
      [lotId],
    );
    return result.rows.length > 0 ? AuctionLot.fromDatabase(result.rows[0]) : null;
  }

  // ---- Nomination Limits ----

  async countActiveLotsForRoster(draftId: string, rosterId: number, client?: PoolClient): Promise<number> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `SELECT COUNT(*) as cnt FROM auction_lots WHERE draft_id = $1 AND nominator_roster_id = $2 AND status = 'active'`,
      [draftId, rosterId],
    );
    return parseInt(result.rows[0].cnt, 10);
  }

  async countAllActiveLots(draftId: string, client?: PoolClient): Promise<number> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `SELECT COUNT(*) as cnt FROM auction_lots WHERE draft_id = $1 AND status = 'active'`,
      [draftId],
    );
    return parseInt(result.rows[0].cnt, 10);
  }

  async countDailyNominationsForRoster(
    draftId: string,
    rosterId: number,
    dateString: string,
    client?: PoolClient,
  ): Promise<number> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `SELECT COUNT(*) as cnt FROM auction_lots WHERE draft_id = $1 AND nominator_roster_id = $2 AND nomination_date = $3`,
      [draftId, rosterId, dateString],
    );
    return parseInt(result.rows[0].cnt, 10);
  }

  // ---- Proxy Bids ----

  async upsertProxyBid(lotId: string, rosterId: number, maxBid: number, client?: PoolClient): Promise<AuctionProxyBid> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `INSERT INTO auction_proxy_bids (lot_id, roster_id, max_bid)
       VALUES ($1, $2, $3)
       ON CONFLICT (lot_id, roster_id) DO UPDATE SET max_bid = $3
       RETURNING *`,
      [lotId, rosterId, maxBid],
    );
    return proxyBidFromDatabase(result.rows[0]);
  }

  async getProxyBid(lotId: string, rosterId: number, client?: PoolClient): Promise<AuctionProxyBid | null> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `SELECT * FROM auction_proxy_bids WHERE lot_id = $1 AND roster_id = $2`,
      [lotId, rosterId],
    );
    return result.rows.length > 0 ? proxyBidFromDatabase(result.rows[0]) : null;
  }

  async getAllProxyBidsForLot(lotId: string, client?: PoolClient): Promise<AuctionProxyBid[]> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `SELECT * FROM auction_proxy_bids WHERE lot_id = $1 ORDER BY max_bid DESC, created_at ASC`,
      [lotId],
    );
    return result.rows.map(proxyBidFromDatabase);
  }

  async getProxyBidsForRosterByDraft(draftId: string, rosterId: number): Promise<Map<string, number>> {
    const result = await this.db.query(
      `SELECT apb.lot_id, apb.max_bid
       FROM auction_proxy_bids apb
       JOIN auction_lots al ON al.id = apb.lot_id
       WHERE al.draft_id = $1 AND apb.roster_id = $2 AND al.status = 'active'`,
      [draftId, rosterId],
    );
    const map = new Map<string, number>();
    for (const row of result.rows) {
      map.set(row.lot_id, row.max_bid);
    }
    return map;
  }

  async deleteProxyBidsForLot(lotId: string, client: PoolClient): Promise<void> {
    await client.query('DELETE FROM auction_proxy_bids WHERE lot_id = $1', [lotId]);
  }

  // ---- Bid History ----

  async recordBidHistory(lotId: string, rosterId: number, bidAmount: number, isProxy: boolean, client?: PoolClient): Promise<void> {
    const conn = client ?? this.db;
    await conn.query(
      `INSERT INTO auction_bid_history (lot_id, roster_id, bid_amount, is_proxy) VALUES ($1, $2, $3, $4)`,
      [lotId, rosterId, bidAmount, isProxy],
    );
  }

  async getBidHistoryForLot(lotId: string): Promise<AuctionBidHistory[]> {
    const result = await this.db.query(
      `SELECT abh.*, u.username
       FROM auction_bid_history abh
       LEFT JOIN rosters r ON r.roster_id = abh.roster_id AND r.league_id = (
         SELECT d.league_id FROM auction_lots al JOIN drafts d ON d.id = al.draft_id WHERE al.id = $1 LIMIT 1
       )
       LEFT JOIN users u ON u.id = r.owner_id
       WHERE abh.lot_id = $1
       ORDER BY abh.created_at DESC`,
      [lotId],
    );
    return result.rows.map(bidHistoryFromDatabase);
  }

  // ---- Budget Data ----

  /**
   * Compute budget data for a single roster from auction_lots.
   * spent = sum of winning_bid for won lots
   * leadingCommitment = sum of current_bid where this roster is the leading bidder on active lots
   * wonCount = count of won lots
   */
  async getRosterBudgetData(draftId: string, rosterId: number, client?: PoolClient): Promise<RosterBudgetData> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'won' AND winning_roster_id = $2 THEN winning_bid ELSE 0 END), 0) as spent,
         COALESCE(SUM(CASE WHEN status = 'won' AND winning_roster_id = $2 THEN 1 ELSE 0 END), 0) as won_count,
         COALESCE(SUM(CASE WHEN status = 'active' AND current_bidder_roster_id = $2 THEN current_bid ELSE 0 END), 0) as leading_commitment
       FROM auction_lots
       WHERE draft_id = $1`,
      [draftId, rosterId],
    );
    const row = result.rows[0];
    return {
      rosterId,
      spent: parseInt(row.spent, 10),
      wonCount: parseInt(row.won_count, 10),
      leadingCommitment: parseInt(row.leading_commitment, 10),
    };
  }

  /**
   * Compute budget data for all rosters in a draft.
   */
  async getAllRosterBudgetData(draftId: string): Promise<Map<number, RosterBudgetData>> {
    const result = await this.db.query(
      `SELECT
         roster_id,
         SUM(CASE WHEN status = 'won' THEN winning_bid ELSE 0 END) as spent,
         SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_count,
         SUM(CASE WHEN status = 'active' AND is_leader THEN current_bid ELSE 0 END) as leading_commitment
       FROM (
         SELECT winning_roster_id as roster_id, winning_bid, 0 as current_bid, status, FALSE as is_leader
         FROM auction_lots WHERE draft_id = $1 AND status = 'won'
         UNION ALL
         SELECT current_bidder_roster_id as roster_id, 0 as winning_bid, current_bid, status, TRUE as is_leader
         FROM auction_lots WHERE draft_id = $1 AND status = 'active' AND current_bidder_roster_id IS NOT NULL
       ) sub
       WHERE roster_id IS NOT NULL
       GROUP BY roster_id`,
      [draftId],
    );
    const map = new Map<number, RosterBudgetData>();
    for (const row of result.rows) {
      map.set(row.roster_id, {
        rosterId: row.roster_id,
        spent: parseInt(row.spent, 10),
        wonCount: parseInt(row.won_count, 10),
        leadingCommitment: parseInt(row.leading_commitment, 10),
      });
    }
    return map;
  }

  // ---- Helpers ----

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
