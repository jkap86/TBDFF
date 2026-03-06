import { Pool, PoolClient } from 'pg';
import { Player } from '../players/players.model';

export class DraftQueueRepository {
  constructor(private readonly db: Pool) {}

  async getQueue(draftId: string, userId: string): Promise<any[]> {
    const result = await this.db.query(
      `SELECT dq.player_id, dq.rank, dq.max_bid,
              COALESCE(p.full_name, dq.player_id) AS full_name,
              p.first_name, p.last_name,
              p.position, p.team, p.search_rank, p.auction_value
       FROM draft_queue dq
       LEFT JOIN players p ON p.id::text = dq.player_id
       WHERE dq.draft_id = $1 AND dq.user_id = $2
       ORDER BY dq.rank ASC`,
      [draftId, userId]
    );
    return result.rows;
  }

  async setQueue(draftId: string, userId: string, playerIds: string[]): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Snapshot existing max_bid values before deleting
      const existing = await client.query(
        'SELECT player_id, max_bid FROM draft_queue WHERE draft_id = $1 AND user_id = $2',
        [draftId, userId]
      );
      const maxBidMap = new Map<string, number | null>();
      for (const row of existing.rows) {
        maxBidMap.set(row.player_id, row.max_bid);
      }

      await client.query(
        'DELETE FROM draft_queue WHERE draft_id = $1 AND user_id = $2',
        [draftId, userId]
      );

      if (playerIds.length > 0) {
        const values: string[] = [];
        const params: any[] = [draftId, userId];
        let paramIndex = 3;

        for (let i = 0; i < playerIds.length; i++) {
          const maxBid = maxBidMap.get(playerIds[i]) ?? null;
          values.push(`($1, $2, $${paramIndex}, ${i + 1}, $${paramIndex + 1})`);
          params.push(playerIds[i], maxBid);
          paramIndex += 2;
        }

        await client.query(
          `INSERT INTO draft_queue (draft_id, user_id, player_id, rank, max_bid)
           VALUES ${values.join(', ')}`,
          params
        );
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async addToQueue(draftId: string, userId: string, playerId: string, maxBid?: number | null): Promise<void> {
    await this.db.query(
      `INSERT INTO draft_queue (draft_id, user_id, player_id, rank, max_bid)
       VALUES ($1, $2, $3, COALESCE(
         (SELECT MAX(rank) FROM draft_queue WHERE draft_id = $1 AND user_id = $2), 0
       ) + 1, $4)
       ON CONFLICT (draft_id, user_id, player_id)
       DO UPDATE SET max_bid = EXCLUDED.max_bid WHERE EXCLUDED.max_bid IS NOT NULL`,
      [draftId, userId, playerId, maxBid ?? null]
    );
  }

  async removeFromQueue(draftId: string, userId: string, playerId: string, client?: PoolClient): Promise<void> {
    const conn = client ?? this.db;
    await conn.query(
      'DELETE FROM draft_queue WHERE draft_id = $1 AND user_id = $2 AND player_id = $3',
      [draftId, userId, playerId]
    );
  }

  async updateQueueItemMaxBid(
    draftId: string,
    userId: string,
    playerId: string,
    maxBid: number | null,
  ): Promise<void> {
    await this.db.query(
      `UPDATE draft_queue SET max_bid = $1
       WHERE draft_id = $2 AND user_id = $3 AND player_id = $4`,
      [maxBid, draftId, userId, playerId]
    );
  }

  async getQueueItemForPlayer(
    draftId: string,
    userId: string,
    playerId: string,
  ): Promise<{ max_bid: number | null } | null> {
    const result = await this.db.query(
      `SELECT max_bid FROM draft_queue
       WHERE draft_id = $1 AND user_id = $2 AND player_id = $3`,
      [draftId, userId, playerId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async getQueueItemsForPlayerByUsers(
    draftId: string,
    userIds: string[],
    playerId: string,
  ): Promise<Map<string, { max_bid: number | null }>> {
    if (userIds.length === 0) return new Map();
    const placeholders = userIds.map((_, i) => `$${i + 3}`).join(', ');
    const result = await this.db.query(
      `SELECT user_id, max_bid FROM draft_queue
       WHERE draft_id = $1 AND player_id = $2 AND user_id IN (${placeholders})`,
      [draftId, playerId, ...userIds]
    );
    const map = new Map<string, { max_bid: number | null }>();
    for (const row of result.rows) {
      map.set(row.user_id, { max_bid: row.max_bid });
    }
    return map;
  }

  async getUserIdsWithMaxBidForPlayer(
    draftId: string,
    playerId: string,
  ): Promise<string[]> {
    const result = await this.db.query(
      `SELECT user_id FROM draft_queue
       WHERE draft_id = $1 AND player_id = $2 AND max_bid IS NOT NULL`,
      [draftId, playerId]
    );
    return result.rows.map((row: any) => row.user_id as string);
  }

  async findFirstAvailableFromQueue(draftId: string, userId: string, client?: PoolClient, playerType?: number): Promise<Player | null> {
    const conn = client ?? this.db;
    const params: unknown[] = [draftId, userId];
    const conditions = [
      'dq.draft_id = $1',
      'dq.user_id = $2',
      'p.active = true',
      `p.position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF')`,
      `NOT EXISTS (
        SELECT 1 FROM draft_picks dp
        WHERE dp.draft_id = $1 AND dp.player_id = dq.player_id
      )`,
    ];

    if (playerType === 1) {
      conditions.push('p.years_exp = 0');
    } else if (playerType === 2) {
      conditions.push('(p.years_exp IS NULL OR p.years_exp > 0)');
    }

    const result = await conn.query(
      `SELECT p.* FROM draft_queue dq
       JOIN players p ON p.id::text = dq.player_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY dq.rank ASC
       LIMIT 1`,
      params
    );
    return result.rows.length > 0 ? Player.fromDatabase(result.rows[0]) : null;
  }

  async findFirstRookiePickFromQueue(
    draftId: string,
    userId: string,
    client?: PoolClient,
  ): Promise<string | null> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `SELECT dq.player_id FROM draft_queue dq
       WHERE dq.draft_id = $1
         AND dq.user_id = $2
         AND dq.player_id LIKE 'rpick:%'
         AND NOT EXISTS (
           SELECT 1 FROM draft_picks dp
           WHERE dp.draft_id = $1 AND dp.player_id = dq.player_id
         )
       ORDER BY dq.rank ASC
       LIMIT 1`,
      [draftId, userId],
    );
    return result.rows.length > 0 ? result.rows[0].player_id : null;
  }
}
