import { Pool, PoolClient } from 'pg';
import { Draft, DraftPick } from './drafts.model';
import { Player } from '../players/players.model';

export class DraftRepository {
  constructor(private readonly db: Pool) {}

  async create(data: {
    leagueId: string;
    season: string;
    sport: string;
    type: string;
    settings: object;
    metadata: object;
    createdBy: string;
  }): Promise<Draft> {
    const result = await this.db.query(
      `INSERT INTO drafts (league_id, season, sport, type, settings, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.leagueId,
        data.season,
        data.sport,
        data.type,
        JSON.stringify(data.settings),
        JSON.stringify(data.metadata),
        data.createdBy,
      ]
    );
    return Draft.fromDatabase(result.rows[0]);
  }

  async findById(id: string, client?: PoolClient): Promise<Draft | null> {
    const conn = client ?? this.db;
    const result = await conn.query('SELECT * FROM drafts WHERE id = $1', [id]);
    return result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
  }

  async findByLeagueId(leagueId: string): Promise<Draft[]> {
    const result = await this.db.query(
      'SELECT * FROM drafts WHERE league_id = $1 ORDER BY created_at DESC',
      [leagueId]
    );
    return result.rows.map(Draft.fromDatabase);
  }

  async findActiveDraftByLeagueId(leagueId: string): Promise<Draft | null> {
    const result = await this.db.query(
      `SELECT * FROM drafts
       WHERE league_id = $1 AND status IN ('pre_draft', 'drafting')
       ORDER BY created_at DESC LIMIT 1`,
      [leagueId]
    );
    return result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
  }

  private buildUpdateClauses(data: Record<string, any>): { fields: string[]; values: any[] } {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const columnMap: Record<string, string> = {
      type: 'type',
      status: 'status',
      startTime: 'start_time',
      lastPicked: 'last_picked',
      draftOrder: 'draft_order',
      slotToRosterId: 'slot_to_roster_id',
      settings: 'settings',
      metadata: 'metadata',
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if (data[key] !== undefined) {
        fields.push(`${column} = $${paramIndex}`);
        const val =
          key === 'settings' || key === 'metadata' || key === 'draftOrder' || key === 'slotToRosterId'
            ? JSON.stringify(data[key])
            : data[key];
        values.push(val);
        paramIndex++;
      }
    }

    return { fields, values };
  }

  async update(id: string, data: Record<string, any>, client?: PoolClient): Promise<Draft | null> {
    const conn = client ?? this.db;
    const { fields, values } = this.buildUpdateClauses(data);

    if (fields.length === 0) return this.findById(id, client);

    values.push(id);
    const result = await conn.query(
      `UPDATE drafts SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
  }

  /**
   * Atomically set draft status to 'drafting' and league status to 'offseason'
   * in a single transaction to prevent them going out of sync.
   */
  async startDraftAtomic(
    draftId: string,
    leagueId: string,
    data: Record<string, any>,
  ): Promise<Draft | null> {
    const { fields, values } = this.buildUpdateClauses(data);
    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');
      let draft: Draft | null = null;
      if (fields.length > 0) {
        const params = [...values, draftId];
        const result = await client.query(
          `UPDATE drafts SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
          params,
        );
        draft = result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
      } else {
        const result = await client.query('SELECT * FROM drafts WHERE id = $1', [draftId]);
        draft = result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
      }
      if (!draft) {
        await client.query('COMMIT');
        return null;
      }
      await client.query('UPDATE leagues SET status = $1 WHERE id = $2', ['offseason', leagueId]);
      await client.query('COMMIT');
      return draft;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async updateStatus(id: string, status: string): Promise<Draft | null> {
    const result = await this.db.query(
      'UPDATE drafts SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
  }

  async linkDraftToLeague(draftId: string, leagueId: string): Promise<void> {
    await this.db.query(
      'UPDATE leagues SET draft_id = $1 WHERE id = $2',
      [draftId, leagueId]
    );
  }

  async updateLeagueStatus(leagueId: string, status: string): Promise<void> {
    await this.db.query(
      'UPDATE leagues SET status = $1 WHERE id = $2',
      [status, leagueId]
    );
  }

  // ---- Future Draft Picks ----

  async createFutureDraftPicks(
    leagueId: string,
    season: string,
    rounds: number,
    rosters: Array<{ rosterId: number; ownerId: string }>,
  ): Promise<void> {
    if (rosters.length === 0) return;

    const values: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const roster of rosters) {
      for (let round = 1; round <= rounds; round++) {
        values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`);
        params.push(leagueId, season, round, roster.ownerId, roster.ownerId, roster.rosterId);
        idx += 6;
      }
    }

    await this.db.query(
      `INSERT INTO future_draft_picks (league_id, season, round, original_owner_id, current_owner_id, roster_id)
       VALUES ${values.join(', ')}
       ON CONFLICT (league_id, season, round, original_owner_id) DO NOTHING`,
      params,
    );
  }

  async findFutureDraftPicksByLeagueSeason(
    leagueId: string,
    season: string,
  ): Promise<Array<{ round: number; originalOwnerId: string; currentOwnerId: string; rosterId: number }>> {
    const result = await this.db.query(
      `SELECT round, original_owner_id, current_owner_id, roster_id
       FROM future_draft_picks
       WHERE league_id = $1 AND season = $2`,
      [leagueId, season],
    );
    return result.rows.map((r: any) => ({
      round: r.round,
      originalOwnerId: r.original_owner_id,
      currentOwnerId: r.current_owner_id,
      rosterId: r.roster_id,
    }));
  }

  // ---- Draft Picks ----

  async createPicks(draftId: string, rounds: number, teams: number, draftType: string, draftOrder: Record<string, number>, slotToRosterId: Record<string, number>, pickOverrides?: Map<string, number>): Promise<DraftPick[]> {
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

    const result = await this.db.query(
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

  async addAutoPickUser(draftId: string, userId: string, client?: PoolClient): Promise<Draft | null> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `UPDATE drafts
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'),
         '{auto_pick_users}',
         (COALESCE(metadata->'auto_pick_users', '[]'::jsonb) || to_jsonb($2::text))
       )
       WHERE id = $1
         AND NOT (COALESCE(metadata->'auto_pick_users', '[]'::jsonb) ? $2)
       RETURNING *`,
      [draftId, userId]
    );
    return result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
  }

  async removeAutoPickUser(draftId: string, userId: string, client?: PoolClient): Promise<Draft | null> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `UPDATE drafts
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'),
         '{auto_pick_users}',
         (SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
          FROM jsonb_array_elements(COALESCE(metadata->'auto_pick_users', '[]'::jsonb)) AS elem
          WHERE elem #>> '{}' != $2)
       )
       WHERE id = $1
       RETURNING *`,
      [draftId, userId]
    );
    return result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
  }

  // ---- Auction-specific ----

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

  async initializeAuctionBudgets(
    draftId: string,
    budgets: Record<string, number>,
  ): Promise<Draft | null> {
    const result = await this.db.query(
      `UPDATE drafts
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'),
         '{auction_budgets}',
         $2::jsonb
       )
       WHERE id = $1
       RETURNING *`,
      [draftId, JSON.stringify(budgets)]
    );
    return result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
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

  async findActiveDraftingAuctions(): Promise<Draft[]> {
    const result = await this.db.query(
      `SELECT * FROM drafts WHERE status = 'drafting' AND type = 'auction'`,
    );
    return result.rows.map(Draft.fromDatabase);
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

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM drafts WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ---- Draft Queue ----

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

  // ── Auction Timer Methods (multi-instance safe scheduling) ──

  async upsertAuctionTimer(
    draftId: string,
    timerType: string,
    runAt: Date,
    client?: PoolClient,
  ): Promise<void> {
    const conn = client ?? this.db;
    await conn.query(
      `INSERT INTO auction_timers (draft_id, timer_type, run_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (draft_id) WHERE claimed_by IS NULL
       DO UPDATE SET run_at = $3, timer_type = $2`,
      [draftId, timerType, runAt.toISOString()],
    );
  }

  async cancelAuctionTimers(draftId: string, client?: PoolClient): Promise<void> {
    const conn = client ?? this.db;
    await conn.query('DELETE FROM auction_timers WHERE draft_id = $1', [draftId]);
  }

  async hasAuctionTimer(draftId: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM auction_timers WHERE draft_id = $1 LIMIT 1',
      [draftId],
    );
    return result.rows.length > 0;
  }

  async claimRunnableTimers(
    instanceId: string,
    limit: number,
  ): Promise<Array<{ id: string; draft_id: string; timer_type: string }>> {
    const result = await this.db.query(
      `UPDATE auction_timers
       SET claimed_by = $1, claimed_at = NOW()
       WHERE id IN (
         SELECT id FROM auction_timers
         WHERE claimed_by IS NULL AND run_at <= NOW()
         ORDER BY run_at
         FOR UPDATE SKIP LOCKED
         LIMIT $2
       )
       RETURNING id, draft_id, timer_type`,
      [instanceId, limit],
    );
    return result.rows;
  }

  async deleteAuctionTimer(timerId: string): Promise<void> {
    await this.db.query('DELETE FROM auction_timers WHERE id = $1', [timerId]);
  }

  async resetStaleClaims(thresholdSeconds: number): Promise<number> {
    const result = await this.db.query(
      `UPDATE auction_timers
       SET claimed_by = NULL, claimed_at = NULL
       WHERE claimed_by IS NOT NULL
         AND claimed_at < NOW() - make_interval(secs => $1)`,
      [thresholdSeconds],
    );
    return result.rowCount ?? 0;
  }

  // ── Auto-Pick Job Methods (multi-instance safe chain continuation) ──

  async insertAutoPickJob(
    draftId: string,
    jobType: 'continuation' | 'recovery',
    runAt?: Date,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO auto_pick_jobs (draft_id, job_type, run_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (draft_id) WHERE claimed_by IS NULL
       DO UPDATE SET run_at = LEAST(auto_pick_jobs.run_at, $3), job_type = $2`,
      [draftId, jobType, (runAt ?? new Date()).toISOString()],
    );
  }

  async claimAutoPickJobs(
    instanceId: string,
    limit: number,
  ): Promise<Array<{ id: string; draft_id: string; job_type: string }>> {
    const result = await this.db.query(
      `UPDATE auto_pick_jobs
       SET claimed_by = $1, claimed_at = NOW()
       WHERE id IN (
         SELECT id FROM auto_pick_jobs
         WHERE claimed_by IS NULL AND run_at <= NOW()
         ORDER BY run_at
         FOR UPDATE SKIP LOCKED
         LIMIT $2
       )
       RETURNING id, draft_id, job_type`,
      [instanceId, limit],
    );
    return result.rows;
  }

  async deleteAutoPickJob(jobId: string): Promise<void> {
    await this.db.query('DELETE FROM auto_pick_jobs WHERE id = $1', [jobId]);
  }

  async resetStaleAutoPickClaims(thresholdSeconds: number): Promise<number> {
    const result = await this.db.query(
      `UPDATE auto_pick_jobs
       SET claimed_by = NULL, claimed_at = NULL
       WHERE claimed_by IS NOT NULL
         AND claimed_at < NOW() - make_interval(secs => $1)`,
      [thresholdSeconds],
    );
    return result.rowCount ?? 0;
  }

  async hasAutoPickJob(draftId: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM auto_pick_jobs WHERE draft_id = $1 LIMIT 1',
      [draftId],
    );
    return result.rows.length > 0;
  }

  async findDraftingNormalDraftsNeedingAutoPick(): Promise<Draft[]> {
    const result = await this.db.query(
      `SELECT * FROM drafts
       WHERE status = 'drafting'
         AND type NOT IN ('auction', 'slow_auction')
         AND jsonb_array_length(COALESCE(metadata->'auto_pick_users', '[]'::jsonb)) > 0
         AND (metadata->>'clock_state' IS NULL OR metadata->>'clock_state' = 'running')`,
    );
    return result.rows.map(Draft.fromDatabase);
  }
}
