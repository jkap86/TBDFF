import { Pool, PoolClient } from 'pg';
import { Transaction, WaiverClaim, PlayerWaiver } from './transactions.model';

export class TransactionRepository {
  constructor(private readonly db: Pool) {}

  // ---- Transactions ----

  async createTransaction(
    client: PoolClient,
    data: {
      leagueId: string;
      type: string;
      status?: string;
      week?: number;
      rosterIds?: number[];
      playerIds?: string[];
      adds?: Record<string, number>;
      drops?: Record<string, number>;
      draftPickIds?: string[];
      settings?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      createdBy?: string;
    },
  ): Promise<Transaction> {
    const result = await client.query(
      `INSERT INTO transactions (league_id, type, status, week, roster_ids, player_ids, adds, drops, draft_pick_ids, settings, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        data.leagueId,
        data.type,
        data.status ?? 'complete',
        data.week ?? null,
        data.rosterIds ?? [],
        data.playerIds ?? [],
        JSON.stringify(data.adds ?? {}),
        JSON.stringify(data.drops ?? {}),
        data.draftPickIds ?? [],
        JSON.stringify(data.settings ?? {}),
        JSON.stringify(data.metadata ?? {}),
        data.createdBy ?? null,
      ],
    );
    return Transaction.fromDatabase(result.rows[0]);
  }

  async findByLeague(
    leagueId: string,
    filters?: { type?: string; limit?: number; offset?: number },
  ): Promise<{ transactions: Transaction[]; total: number }> {
    let where = 'WHERE t.league_id = $1';
    const params: any[] = [leagueId];
    let idx = 2;

    if (filters?.type) {
      where += ` AND t.type = $${idx}`;
      params.push(filters.type);
      idx++;
    }

    const countResult = await this.db.query(
      `SELECT COUNT(*)::int AS total FROM transactions t ${where}`,
      params,
    );

    const limit = filters?.limit ?? 25;
    const offset = filters?.offset ?? 0;

    const result = await this.db.query(
      `SELECT t.* FROM transactions t ${where} ORDER BY t.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );

    return {
      transactions: result.rows.map(Transaction.fromDatabase),
      total: countResult.rows[0].total,
    };
  }

  // ---- Waiver Claims ----

  async createWaiverClaim(
    data: {
      leagueId: string;
      rosterId: number;
      userId: string;
      playerId: string;
      dropPlayerId?: string;
      faabAmount?: number;
      priority: number;
      processAt: Date;
    },
  ): Promise<WaiverClaim> {
    const result = await this.db.query(
      `INSERT INTO waiver_claims (league_id, roster_id, user_id, player_id, drop_player_id, faab_amount, priority, process_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.leagueId, data.rosterId, data.userId, data.playerId,
        data.dropPlayerId ?? null, data.faabAmount ?? 0, data.priority, data.processAt,
      ],
    );
    return WaiverClaim.fromDatabase(result.rows[0]);
  }

  async findWaiverClaimById(id: string): Promise<WaiverClaim | null> {
    const result = await this.db.query('SELECT * FROM waiver_claims WHERE id = $1', [id]);
    return result.rows.length > 0 ? WaiverClaim.fromDatabase(result.rows[0]) : null;
  }

  async findPendingClaimsByUser(leagueId: string, userId: string): Promise<WaiverClaim[]> {
    const result = await this.db.query(
      `SELECT * FROM waiver_claims
       WHERE league_id = $1 AND user_id = $2 AND status = 'pending'
       ORDER BY priority ASC, created_at ASC`,
      [leagueId, userId],
    );
    return result.rows.map(WaiverClaim.fromDatabase);
  }

  async findPendingClaimsForProcessing(): Promise<string[]> {
    const result = await this.db.query(
      `SELECT DISTINCT league_id FROM waiver_claims
       WHERE status = 'pending' AND process_at <= NOW()`,
    );
    return result.rows.map((r: any) => r.league_id);
  }

  async findPendingClaimsByLeague(client: PoolClient, leagueId: string): Promise<WaiverClaim[]> {
    const result = await client.query(
      `SELECT * FROM waiver_claims
       WHERE league_id = $1 AND status = 'pending' AND process_at <= NOW()
       ORDER BY player_id, faab_amount DESC, priority ASC, created_at ASC`,
      [leagueId],
    );
    return result.rows.map(WaiverClaim.fromDatabase);
  }

  async updateClaimStatus(
    client: PoolClient,
    claimId: string,
    status: string,
    transactionId?: string,
  ): Promise<void> {
    await client.query(
      `UPDATE waiver_claims SET status = $2, processed_at = NOW(), transaction_id = $3
       WHERE id = $1`,
      [claimId, status, transactionId ?? null],
    );
  }

  async updateClaim(
    claimId: string,
    data: { dropPlayerId?: string | null; faabAmount?: number },
  ): Promise<WaiverClaim | null> {
    const sets: string[] = [];
    const params: any[] = [claimId];
    let idx = 2;

    if (data.dropPlayerId !== undefined) {
      sets.push(`drop_player_id = $${idx}`);
      params.push(data.dropPlayerId);
      idx++;
    }
    if (data.faabAmount !== undefined) {
      sets.push(`faab_amount = $${idx}`);
      params.push(data.faabAmount);
      idx++;
    }

    if (sets.length === 0) return this.findWaiverClaimById(claimId);

    const result = await this.db.query(
      `UPDATE waiver_claims SET ${sets.join(', ')} WHERE id = $1 AND status = 'pending' RETURNING *`,
      params,
    );
    return result.rows.length > 0 ? WaiverClaim.fromDatabase(result.rows[0]) : null;
  }

  async cancelClaim(claimId: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE waiver_claims SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`,
      [claimId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ---- Player Waivers ----

  async createPlayerWaiver(client: PoolClient, leagueId: string, playerId: string, droppedBy: string, clearDays: number): Promise<void> {
    const expires = new Date();
    expires.setDate(expires.getDate() + clearDays);
    await client.query(
      `INSERT INTO player_waivers (league_id, player_id, dropped_by, waiver_expires)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (league_id, player_id) DO UPDATE SET waiver_expires = $4, dropped_by = $3`,
      [leagueId, playerId, droppedBy, expires],
    );
  }

  async isPlayerOnWaivers(leagueId: string, playerId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM player_waivers
       WHERE league_id = $1 AND player_id = $2 AND waiver_expires > NOW()`,
      [leagueId, playerId],
    );
    return result.rows.length > 0;
  }

  async cleanExpiredWaivers(client?: PoolClient): Promise<void> {
    const conn = client ?? this.db;
    await conn.query('DELETE FROM player_waivers WHERE waiver_expires <= NOW()');
  }

  async rotateWaiverPriority(client: PoolClient, leagueId: string, winnerRosterId: number): Promise<void> {
    // Get the winner's current priority
    const result = await client.query(
      `SELECT (settings->>'waiver_position')::int AS waiver_position FROM rosters WHERE league_id = $1 AND roster_id = $2`,
      [leagueId, winnerRosterId],
    );
    if (result.rows.length === 0) return;
    const winnerPriority = result.rows[0].waiver_position ?? 0;

    // Move everyone with a worse (higher number) priority up by 1
    await client.query(
      `UPDATE rosters SET settings = jsonb_set(settings, '{waiver_position}', to_jsonb(((settings->>'waiver_position')::int) - 1))
       WHERE league_id = $1 AND (settings->>'waiver_position')::int > $2`,
      [leagueId, winnerPriority],
    );

    // Get max priority (last position)
    const maxResult = await client.query(
      `SELECT MAX((settings->>'waiver_position')::int) AS max_priority FROM rosters WHERE league_id = $1`,
      [leagueId],
    );
    const lastPriority = (maxResult.rows[0].max_priority ?? 0) + 1;

    // Set winner to last priority
    await client.query(
      `UPDATE rosters SET settings = jsonb_set(settings, '{waiver_position}', to_jsonb($1::int))
       WHERE league_id = $2 AND roster_id = $3`,
      [lastPriority, leagueId, winnerRosterId],
    );
  }

  // ---- Roster helpers ----

  async addPlayerToRoster(client: PoolClient, leagueId: string, ownerId: string, playerId: string): Promise<boolean> {
    // Only appends if the player is not already on the roster; returns false if duplicate
    const result = await client.query(
      `UPDATE rosters
       SET players = array_append(players, $1)
       WHERE league_id = $2 AND owner_id = $3
         AND NOT ($1 = ANY(players))`,
      [playerId, leagueId, ownerId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async removePlayerFromRoster(client: PoolClient, leagueId: string, ownerId: string, playerId: string): Promise<void> {
    await client.query(
      `UPDATE rosters SET
         players  = array_remove(players, $1),
         starters = array_remove(starters, $1),
         reserve  = array_remove(reserve, $1),
         taxi     = array_remove(taxi, $1)
       WHERE league_id = $2 AND owner_id = $3`,
      [playerId, leagueId, ownerId],
    );
  }

  async deductFaab(client: PoolClient, leagueId: string, ownerId: string, amount: number): Promise<boolean> {
    const result = await client.query(
      `UPDATE rosters SET waiver_budget = waiver_budget - $1
       WHERE league_id = $2 AND owner_id = $3 AND waiver_budget >= $1`,
      [amount, leagueId, ownerId],
    );
    return (result.rowCount ?? 0) > 0;
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
