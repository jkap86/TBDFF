import { Pool, PoolClient } from 'pg';
import { Draft, DraftPick } from './drafts.model';
import { Player } from '../players/players.model';

export class DraftPicksRepository {
  constructor(private readonly db: Pool) {}

  async createPicks(draftId: string, rounds: number, teams: number, draftType: string, draftOrder: Record<string, number>, slotToRosterId: Record<string, number>, pickOverrides?: Map<string, number>, client?: PoolClient): Promise<DraftPick[]> {
    const db = client ?? this.db;
    // Generate all pick slots based on draft type and order
    const pickValues: string[] = [];
    const params: any[] = [draftId];
    let paramIndex = 2;

    for (let round = 1; round <= rounds; round++) {
      for (let pickInRound = 1; pickInRound <= teams; pickInRound++) {
        // Determine draft_slot based on draft type
        let draftSlot: number;
        if (draftType === 'snake') {
          // Even rounds go in reverse order
          draftSlot = round % 2 === 1 ? pickInRound : teams - pickInRound + 1;
        } else if (draftType === '3rr') {
          // 3rd Round Reversal: rounds 1-2 normal snake, round 3+ reversed
          if (round <= 2) {
            draftSlot = round % 2 === 1 ? pickInRound : teams - pickInRound + 1;
          } else {
            draftSlot = round % 2 === 0 ? pickInRound : teams - pickInRound + 1;
          }
        } else {
          // Linear: same order every round
          draftSlot = pickInRound;
        }

        const overallPick = (round - 1) * teams + pickInRound;
        const rosterId = pickOverrides?.get(`${round}:${draftSlot}`) ?? slotToRosterId[String(draftSlot)] ?? draftSlot;

        pickValues.push(`($1, $${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
        params.push(rosterId, round, overallPick, draftSlot);
        paramIndex += 4;
      }
    }

    const result = await db.query(
      `INSERT INTO draft_picks (draft_id, roster_id, round, pick_no, draft_slot)
       VALUES ${pickValues.join(', ')}
       ON CONFLICT (draft_id, round, pick_no) DO NOTHING
       RETURNING *`,
      params
    );
    return result.rows.map(DraftPick.fromDatabase);
  }

  async findPicksByDraftId(draftId: string): Promise<DraftPick[]> {
    const result = await this.db.query(
      `SELECT dp.*, u.username
       FROM draft_picks dp
       LEFT JOIN users u ON u.id = dp.picked_by
       WHERE dp.draft_id = $1
       ORDER BY dp.pick_no ASC`,
      [draftId]
    );
    return result.rows.map(DraftPick.fromDatabase);
  }

  async findNextPick(draftId: string, client?: PoolClient): Promise<DraftPick | null> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `SELECT dp.*, u.username
       FROM draft_picks dp
       LEFT JOIN users u ON u.id = dp.picked_by
       WHERE dp.draft_id = $1
         AND dp.player_id IS NULL
         AND (dp.metadata->>'forfeited' IS DISTINCT FROM 'true')
       ORDER BY dp.pick_no ASC
       LIMIT 1`,
      [draftId]
    );
    return result.rows.length > 0 ? DraftPick.fromDatabase(result.rows[0]) : null;
  }

  async makePick(pickId: string, playerId: string, pickedBy: string, metadata: object): Promise<DraftPick | null> {
    const result = await this.db.query(
      `WITH updated AS (
         UPDATE draft_picks
         SET player_id = $1, picked_by = $2, metadata = $3
         WHERE id = $4 AND player_id IS NULL
         RETURNING *
       )
       SELECT updated.*, u.username
       FROM updated
       LEFT JOIN users u ON u.id = updated.picked_by`,
      [playerId, pickedBy, JSON.stringify(metadata), pickId]
    );
    return result.rows.length > 0 ? DraftPick.fromDatabase(result.rows[0]) : null;
  }

  async findPickById(pickId: string): Promise<DraftPick | null> {
    const result = await this.db.query(
      `SELECT dp.*, u.username
       FROM draft_picks dp
       LEFT JOIN users u ON u.id = dp.picked_by
       WHERE dp.id = $1`,
      [pickId],
    );
    return result.rows.length > 0 ? DraftPick.fromDatabase(result.rows[0]) : null;
  }

  async isPlayerPicked(draftId: string, playerId: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM draft_picks WHERE draft_id = $1 AND player_id = $2 LIMIT 1',
      [draftId, playerId]
    );
    return result.rows.length > 0;
  }

  async completeIfAllPicked(draftId: string): Promise<Draft | null> {
    const result = await this.db.query(
      `UPDATE drafts SET status = 'complete'
       WHERE id = $1 AND status = 'drafting'
       AND (SELECT COUNT(*) FROM draft_picks
            WHERE draft_id = $1
              AND player_id IS NULL
              AND (metadata->>'forfeited' IS DISTINCT FROM 'true')) = 0
       RETURNING *`,
      [draftId]
    );
    return result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
  }

  /**
   * Atomically mark the draft complete and conditionally advance league to 'reg_season'.
   * League transitions to 'reg_season' only when ALL drafts are complete AND matchups exist.
   * Returns the completed draft, or null if not all picks have been made.
   */
  async completeAndUpdateLeague(draftId: string, leagueId: string): Promise<Draft | null> {
    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE drafts SET status = 'complete'
         WHERE id = $1 AND status = 'drafting'
           AND (SELECT COUNT(*) FROM draft_picks
                WHERE draft_id = $1
                  AND player_id IS NULL
                  AND (metadata->>'forfeited' IS DISTINCT FROM 'true')) = 0
         RETURNING *`,
        [draftId],
      );
      if (result.rows.length === 0) {
        await client.query('COMMIT');
        return null;
      }
      // Advance to reg_season only if all drafts complete and matchups exist
      const allDraftsComplete = await client.query(
        `SELECT COUNT(*) = 0 AS ready FROM drafts WHERE league_id = $1 AND status != 'complete'`,
        [leagueId],
      );
      const matchupsExist = await client.query(
        `SELECT EXISTS(SELECT 1 FROM matchups WHERE league_id = $1) AS ready`,
        [leagueId],
      );
      if (allDraftsComplete.rows[0].ready && matchupsExist.rows[0].ready) {
        await client.query(`UPDATE leagues SET status = 'reg_season' WHERE id = $1`, [leagueId]);
      }
      await client.query(
        `UPDATE rosters r
         SET players = r.players || sub.new_players
         FROM (
           SELECT dp.roster_id, array_agg(dp.player_id ORDER BY dp.pick_no) AS new_players
           FROM draft_picks dp
           WHERE dp.draft_id = $1
             AND dp.player_id IS NOT NULL
           GROUP BY dp.roster_id
         ) sub
         WHERE r.league_id = $2
           AND r.roster_id = sub.roster_id`,
        [draftId, leagueId],
      );
      await client.query('COMMIT');
      return Draft.fromDatabase(result.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Same as completeAndUpdateLeague but uses a provided client (no new transaction).
   * Caller is responsible for BEGIN/COMMIT/ROLLBACK.
   */
  async completeAndUpdateLeagueInTx(client: PoolClient, draftId: string, leagueId: string): Promise<Draft | null> {
    const result = await client.query(
      `UPDATE drafts SET status = 'complete'
       WHERE id = $1 AND status = 'drafting'
         AND (SELECT COUNT(*) FROM draft_picks
              WHERE draft_id = $1
                AND player_id IS NULL
                AND (metadata->>'forfeited' IS DISTINCT FROM 'true')) = 0
       RETURNING *`,
      [draftId],
    );
    if (result.rows.length === 0) {
      return null;
    }
    // Advance to reg_season only if all drafts complete and matchups exist
    const allDraftsComplete = await client.query(
      `SELECT COUNT(*) = 0 AS ready FROM drafts WHERE league_id = $1 AND status != 'complete'`,
      [leagueId],
    );
    const matchupsExist = await client.query(
      `SELECT EXISTS(SELECT 1 FROM matchups WHERE league_id = $1) AS ready`,
      [leagueId],
    );
    if (allDraftsComplete.rows[0].ready && matchupsExist.rows[0].ready) {
      await client.query(`UPDATE leagues SET status = 'reg_season' WHERE id = $1`, [leagueId]);
    }
    await client.query(
      `UPDATE rosters r
       SET players = r.players || sub.new_players
       FROM (
         SELECT dp.roster_id, array_agg(dp.player_id ORDER BY dp.pick_no) AS new_players
         FROM draft_picks dp
         WHERE dp.draft_id = $1
           AND dp.player_id IS NOT NULL
           AND dp.player_id NOT LIKE 'rpick:%'
         GROUP BY dp.roster_id
       ) sub
       WHERE r.league_id = $2
         AND r.roster_id = sub.roster_id`,
      [draftId, leagueId],
    );
    return Draft.fromDatabase(result.rows[0]);
  }

  async makeAuctionPick(
    pickId: string,
    playerId: string,
    pickedBy: string,
    rosterId: number,
    amount: number,
    metadata: object,
    client?: PoolClient,
  ): Promise<DraftPick | null> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `WITH updated AS (
         UPDATE draft_picks
         SET player_id = $1, picked_by = $2, roster_id = $3, amount = $4, metadata = $5
         WHERE id = $6 AND player_id IS NULL
         RETURNING *
       )
       SELECT updated.*, u.username
       FROM updated
       LEFT JOIN users u ON u.id = updated.picked_by`,
      [playerId, pickedBy, rosterId, amount, JSON.stringify(metadata), pickId]
    );
    return result.rows.length > 0 ? DraftPick.fromDatabase(result.rows[0]) : null;
  }

  async forfeitPick(pickId: string, client?: PoolClient): Promise<void> {
    const conn = client ?? this.db;
    await conn.query(
      `UPDATE draft_picks
       SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"forfeited": true}'::jsonb
       WHERE id = $1 AND player_id IS NULL`,
      [pickId],
    );
  }

  async countPicksWonByRoster(draftId: string, rosterId: number, client?: PoolClient): Promise<number> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `SELECT COUNT(*) as cnt FROM draft_picks
       WHERE draft_id = $1 AND roster_id = $2 AND player_id IS NOT NULL`,
      [draftId, rosterId]
    );
    return parseInt(result.rows[0].cnt, 10);
  }

  async countPicksWonByRosters(
    draftId: string,
    rosterIds: number[],
    client?: PoolClient,
  ): Promise<Map<number, number>> {
    if (rosterIds.length === 0) return new Map();
    const conn = client ?? this.db;
    const placeholders = rosterIds.map((_, i) => `$${i + 2}`).join(', ');
    const result = await conn.query(
      `SELECT roster_id, COUNT(*) as cnt FROM draft_picks
       WHERE draft_id = $1 AND roster_id IN (${placeholders}) AND player_id IS NOT NULL
       GROUP BY roster_id`,
      [draftId, ...rosterIds]
    );
    const map = new Map<number, number>();
    for (const row of result.rows) {
      map.set(row.roster_id, parseInt(row.cnt, 10));
    }
    return map;
  }

  async deductBudget(
    draftId: string,
    rosterId: number,
    amount: number,
    client?: PoolClient,
  ): Promise<Draft | null> {
    const conn = client ?? this.db;
    // The WHERE clause makes check-and-deduct atomic: returns null if budget is insufficient,
    // preventing concurrent bids from overdrafting.
    const result = await conn.query(
      `UPDATE drafts
       SET metadata = jsonb_set(
         metadata,
         ARRAY['auction_budgets', $2::text],
         to_jsonb((metadata->'auction_budgets'->>$2::text)::int - $3)
       )
       WHERE id = $1
         AND (metadata->'auction_budgets'->>$2::text)::int >= $3
       RETURNING *`,
      [draftId, String(rosterId), amount]
    );
    return result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
  }

  async findBestAvailable(draftId: string, client?: PoolClient, playerType?: number): Promise<Player | null> {
    const conn = client ?? this.db;
    const params: unknown[] = [draftId];
    const conditions = [
      'p.active = true',
      `p.position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF')`,
      `p.id::text NOT IN (
        SELECT dp.player_id FROM draft_picks dp
        WHERE dp.draft_id = $1 AND dp.player_id IS NOT NULL
      )`,
    ];

    if (playerType === 1) {
      conditions.push('p.years_exp = 0');
    } else if (playerType === 2) {
      conditions.push('(p.years_exp IS NULL OR p.years_exp > 0)');
    }

    const result = await conn.query(
      `SELECT p.* FROM players p
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.search_rank ASC NULLS LAST
       LIMIT 1`,
      params
    );
    return result.rows.length > 0 ? Player.fromDatabase(result.rows[0]) : null;
  }

  async findAvailablePlayers(
    draftId: string,
    options: { position?: string; query?: string; limit: number; offset: number; playerType?: number }
  ): Promise<Player[]> {
    const params: unknown[] = [draftId];
    const conditions = [
      'p.active = true',
      `p.position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF')`,
      `p.id::text NOT IN (
        SELECT dp.player_id FROM draft_picks dp
        WHERE dp.draft_id = $1 AND dp.player_id IS NOT NULL
      )`,
      `p.id::text NOT IN (
        SELECT al.player_id::text FROM auction_lots al
        WHERE al.draft_id = $1 AND al.status = 'active'
      )`,
    ];

    if (options.playerType === 1) {
      conditions.push('p.years_exp = 0');
    } else if (options.playerType === 2) {
      conditions.push('(p.years_exp IS NULL OR p.years_exp > 0)');
    }

    if (options.position) {
      params.push(options.position);
      conditions.push(`p.position = $${params.length}`);
    }

    if (options.query) {
      params.push(`%${options.query}%`);
      conditions.push(`(p.full_name ILIKE $${params.length} OR p.last_name ILIKE $${params.length})`);
    }

    params.push(options.limit, options.offset);

    const result = await this.db.query(
      `SELECT p.* FROM players p
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.search_rank ASC NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return result.rows.map(Player.fromDatabase);
  }
}
