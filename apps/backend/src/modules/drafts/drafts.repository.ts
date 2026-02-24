import { Pool } from 'pg';
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

  async findById(id: string): Promise<Draft | null> {
    const result = await this.db.query('SELECT * FROM drafts WHERE id = $1', [id]);
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

  async update(id: string, data: Record<string, any>): Promise<Draft | null> {
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

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    const result = await this.db.query(
      `UPDATE drafts SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
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

  // ---- Draft Picks ----

  async createPicks(draftId: string, rounds: number, teams: number, draftType: string, draftOrder: Record<string, number>, slotToRosterId: Record<string, number>): Promise<DraftPick[]> {
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
        const rosterId = slotToRosterId[String(draftSlot)] ?? draftSlot;

        pickValues.push(`($1, $${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
        params.push(rosterId, round, overallPick, draftSlot);
        paramIndex += 4;
      }
    }

    const result = await this.db.query(
      `INSERT INTO draft_picks (draft_id, roster_id, round, pick_no, draft_slot)
       VALUES ${pickValues.join(', ')}
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

  async findNextPick(draftId: string): Promise<DraftPick | null> {
    const result = await this.db.query(
      `SELECT dp.*, u.username
       FROM draft_picks dp
       LEFT JOIN users u ON u.id = dp.picked_by
       WHERE dp.draft_id = $1 AND dp.player_id IS NULL
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
       AND (SELECT COUNT(*) FROM draft_picks WHERE draft_id = $1 AND player_id IS NULL) = 0
       RETURNING *`,
      [draftId]
    );
    return result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
  }

  async findBestAvailable(draftId: string): Promise<Player | null> {
    const result = await this.db.query(
      `SELECT p.* FROM players p
       WHERE p.active = true
         AND p.position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF')
         AND p.id::text NOT IN (
           SELECT dp.player_id FROM draft_picks dp
           WHERE dp.draft_id = $1 AND dp.player_id IS NOT NULL
         )
       ORDER BY p.search_rank ASC NULLS LAST
       LIMIT 1`,
      [draftId]
    );
    return result.rows.length > 0 ? Player.fromDatabase(result.rows[0]) : null;
  }

  async addAutoPickUser(draftId: string, userId: string): Promise<Draft | null> {
    const result = await this.db.query(
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

  async removeAutoPickUser(draftId: string, userId: string): Promise<Draft | null> {
    const result = await this.db.query(
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
  ): Promise<DraftPick | null> {
    const result = await this.db.query(
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
  ): Promise<Draft | null> {
    const result = await this.db.query(
      `UPDATE drafts
       SET metadata = jsonb_set(
         metadata,
         ARRAY['auction_budgets', $2::text],
         to_jsonb((metadata->'auction_budgets'->>$2::text)::int - $3)
       )
       WHERE id = $1
       RETURNING *`,
      [draftId, String(rosterId), amount]
    );
    return result.rows.length > 0 ? Draft.fromDatabase(result.rows[0]) : null;
  }

  async countPicksWonByRoster(draftId: string, rosterId: number): Promise<number> {
    const result = await this.db.query(
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
              p.full_name, p.first_name, p.last_name,
              p.position, p.team, p.search_rank, p.auction_value
       FROM draft_queue dq
       JOIN players p ON p.id::text = dq.player_id
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
       ON CONFLICT (draft_id, user_id, player_id) DO NOTHING`,
      [draftId, userId, playerId, maxBid ?? null]
    );
  }

  async removeFromQueue(draftId: string, userId: string, playerId: string): Promise<void> {
    await this.db.query(
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

  async findFirstAvailableFromQueue(draftId: string, userId: string): Promise<Player | null> {
    const result = await this.db.query(
      `SELECT p.* FROM draft_queue dq
       JOIN players p ON p.id::text = dq.player_id
       WHERE dq.draft_id = $1
         AND dq.user_id = $2
         AND p.active = true
         AND p.position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF')
         AND dq.player_id NOT IN (
           SELECT dp.player_id FROM draft_picks dp
           WHERE dp.draft_id = $1 AND dp.player_id IS NOT NULL
         )
       ORDER BY dq.rank ASC
       LIMIT 1`,
      [draftId, userId]
    );
    return result.rows.length > 0 ? Player.fromDatabase(result.rows[0]) : null;
  }
}
