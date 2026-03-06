import { Pool, PoolClient } from 'pg';
import { Draft } from './drafts.model';
import type { DraftPicksRepository } from './draft-picks.repository';

export class DraftRepository {
  private picksRepository?: DraftPicksRepository;

  constructor(private readonly db: Pool) {}

  setPicksRepository(picksRepo: DraftPicksRepository): void {
    this.picksRepository = picksRepo;
  }

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
    pickArgs?: {
      rounds: number;
      teams: number;
      draftType: string;
      draftOrder: Record<string, number>;
      slotToRosterId: Record<string, number>;
      pickOverrides?: Map<string, number>;
    },
  ): Promise<Draft | null> {
    const { fields, values } = this.buildUpdateClauses(data);
    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Create picks inside the transaction if provided
      if (pickArgs && this.picksRepository) {
        await this.picksRepository.createPicks(
          draftId, pickArgs.rounds, pickArgs.teams, pickArgs.draftType,
          pickArgs.draftOrder, pickArgs.slotToRosterId, pickArgs.pickOverrides,
          client,
        );
      }

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

  async findActiveDraftingAuctions(): Promise<Draft[]> {
    const result = await this.db.query(
      `SELECT * FROM drafts WHERE status = 'drafting' AND type = 'auction'`,
    );
    return result.rows.map(Draft.fromDatabase);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM drafts WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
