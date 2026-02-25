import { Pool, PoolClient } from 'pg';
import { TradeProposal, TradeItem, FutureDraftPick } from './trades.model';

export class TradeRepository {
  constructor(private readonly db: Pool) {}

  // ---- Trade Proposals ----

  async createProposal(
    client: PoolClient,
    data: {
      leagueId: string;
      proposedBy: string;
      proposedTo: string;
      week?: number;
      message?: string;
    },
  ): Promise<TradeProposal> {
    const result = await client.query(
      `INSERT INTO trade_proposals (league_id, proposed_by, proposed_to, week, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.leagueId, data.proposedBy, data.proposedTo, data.week ?? null, data.message ?? null],
    );
    return TradeProposal.fromDatabase(result.rows[0]);
  }

  async createItems(
    client: PoolClient,
    tradeId: string,
    items: Array<{
      side: string;
      item_type: string;
      player_id?: string;
      draft_pick_id?: string;
      faab_amount?: number;
      roster_id: number;
    }>,
  ): Promise<TradeItem[]> {
    const results: TradeItem[] = [];
    for (const item of items) {
      const result = await client.query(
        `INSERT INTO trade_items (trade_id, side, item_type, player_id, draft_pick_id, faab_amount, roster_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [tradeId, item.side, item.item_type, item.player_id ?? null, item.draft_pick_id ?? null, item.faab_amount ?? null, item.roster_id],
      );
      results.push(TradeItem.fromDatabase(result.rows[0]));
    }
    return results;
  }

  async findProposalById(id: string): Promise<TradeProposal | null> {
    const result = await this.db.query(
      `SELECT tp.*,
              u1.username AS proposed_by_username,
              u2.username AS proposed_to_username
       FROM trade_proposals tp
       JOIN users u1 ON u1.id = tp.proposed_by
       JOIN users u2 ON u2.id = tp.proposed_to
       WHERE tp.id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;

    const items = await this.findItemsByTradeId(id);
    return TradeProposal.fromDatabase(result.rows[0], items);
  }

  async findItemsByTradeId(tradeId: string): Promise<TradeItem[]> {
    const result = await this.db.query(
      'SELECT * FROM trade_items WHERE trade_id = $1 ORDER BY side, item_type',
      [tradeId],
    );
    return result.rows.map(TradeItem.fromDatabase);
  }

  async findProposalsByLeague(leagueId: string, status?: string): Promise<TradeProposal[]> {
    let query = `SELECT tp.*,
                        u1.username AS proposed_by_username,
                        u2.username AS proposed_to_username
                 FROM trade_proposals tp
                 JOIN users u1 ON u1.id = tp.proposed_by
                 JOIN users u2 ON u2.id = tp.proposed_to
                 WHERE tp.league_id = $1`;
    const params: any[] = [leagueId];

    if (status) {
      query += ' AND tp.status = $2';
      params.push(status);
    }

    query += ' ORDER BY tp.created_at DESC';

    const result = await this.db.query(query, params);
    const trades: TradeProposal[] = [];
    for (const row of result.rows) {
      const items = await this.findItemsByTradeId(row.id);
      trades.push(TradeProposal.fromDatabase(row, items));
    }
    return trades;
  }

  async updateProposalStatus(
    client: PoolClient,
    id: string,
    status: string,
    extra?: { reviewExpiresAt?: Date; transactionId?: string },
  ): Promise<void> {
    const sets = ['status = $2'];
    const params: any[] = [id, status];
    let idx = 3;

    if (extra?.reviewExpiresAt) {
      sets.push(`review_expires_at = $${idx}`);
      params.push(extra.reviewExpiresAt);
      idx++;
    }
    if (extra?.transactionId) {
      sets.push(`transaction_id = $${idx}`);
      params.push(extra.transactionId);
      idx++;
    }

    await client.query(
      `UPDATE trade_proposals SET ${sets.join(', ')} WHERE id = $1`,
      params,
    );
  }

  async findExpiredReviews(): Promise<TradeProposal[]> {
    const result = await this.db.query(
      `SELECT tp.*,
              u1.username AS proposed_by_username,
              u2.username AS proposed_to_username
       FROM trade_proposals tp
       JOIN users u1 ON u1.id = tp.proposed_by
       JOIN users u2 ON u2.id = tp.proposed_to
       WHERE tp.status = 'review' AND tp.review_expires_at <= NOW()`,
    );
    const trades: TradeProposal[] = [];
    for (const row of result.rows) {
      const items = await this.findItemsByTradeId(row.id);
      trades.push(TradeProposal.fromDatabase(row, items));
    }
    return trades;
  }

  // ---- Future Draft Picks ----

  async findFuturePicksByLeague(leagueId: string): Promise<FutureDraftPick[]> {
    const result = await this.db.query(
      `SELECT fp.*,
              u1.username AS original_owner_username,
              u2.username AS current_owner_username
       FROM future_draft_picks fp
       JOIN users u1 ON u1.id = fp.original_owner_id
       JOIN users u2 ON u2.id = fp.current_owner_id
       WHERE fp.league_id = $1
       ORDER BY fp.season, fp.round, u1.username`,
      [leagueId],
    );
    return result.rows.map(FutureDraftPick.fromDatabase);
  }

  async findFuturePicksByUser(leagueId: string, userId: string): Promise<FutureDraftPick[]> {
    const result = await this.db.query(
      `SELECT fp.*,
              u1.username AS original_owner_username,
              u2.username AS current_owner_username
       FROM future_draft_picks fp
       JOIN users u1 ON u1.id = fp.original_owner_id
       JOIN users u2 ON u2.id = fp.current_owner_id
       WHERE fp.league_id = $1 AND fp.current_owner_id = $2
       ORDER BY fp.season, fp.round`,
      [leagueId, userId],
    );
    return result.rows.map(FutureDraftPick.fromDatabase);
  }

  async transferDraftPick(client: PoolClient, pickId: string, newOwnerId: string, newRosterId: number): Promise<void> {
    await client.query(
      'UPDATE future_draft_picks SET current_owner_id = $1, roster_id = $2 WHERE id = $3',
      [newOwnerId, newRosterId, pickId],
    );
  }

  // ---- Transactional helpers ----

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
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
