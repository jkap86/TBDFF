import { Pool, PoolClient } from 'pg';
import { MatchupDerby, MatchupDerbyOrderEntry, MatchupDerbyPick } from './matchup-derby.model';

export class MatchupDerbyRepository {
  constructor(private readonly db: Pool) {}

  async findById(id: string, client?: PoolClient): Promise<MatchupDerby | null> {
    const conn = client ?? this.db;
    const result = await conn.query(
      'SELECT * FROM matchup_derbies WHERE id = $1',
      [id],
    );
    return result.rows[0] ? MatchupDerby.fromDatabase(result.rows[0]) : null;
  }

  async findActiveByLeagueId(leagueId: string, client?: PoolClient): Promise<MatchupDerby | null> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `SELECT * FROM matchup_derbies
       WHERE league_id = $1 AND status IN ('pending', 'active')
       LIMIT 1`,
      [leagueId],
    );
    return result.rows[0] ? MatchupDerby.fromDatabase(result.rows[0]) : null;
  }

  async findByLeagueId(leagueId: string): Promise<MatchupDerby | null> {
    const result = await this.db.query(
      `SELECT * FROM matchup_derbies
       WHERE league_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [leagueId],
    );
    return result.rows[0] ? MatchupDerby.fromDatabase(result.rows[0]) : null;
  }

  async create(
    leagueId: string,
    data: {
      status: string;
      derbyOrder: MatchupDerbyOrderEntry[];
      picks: MatchupDerbyPick[];
      currentPickIndex: number;
      totalPicks: number;
      pickTimer: number;
      pickDeadline: Date | null;
      timeoutAction: number;
      skippedUsers: string[];
      startedAt: Date | null;
    },
  ): Promise<MatchupDerby> {
    const result = await this.db.query(
      `INSERT INTO matchup_derbies
       (league_id, status, derby_order, picks, current_pick_index, total_picks,
        pick_timer, pick_deadline, timeout_action, skipped_users, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        leagueId,
        data.status,
        JSON.stringify(data.derbyOrder),
        JSON.stringify(data.picks),
        data.currentPickIndex,
        data.totalPicks,
        data.pickTimer,
        data.pickDeadline,
        data.timeoutAction,
        data.skippedUsers,
        data.startedAt,
      ],
    );
    return MatchupDerby.fromDatabase(result.rows[0]);
  }

  async update(
    id: string,
    data: {
      status?: string;
      derbyOrder?: MatchupDerbyOrderEntry[];
      picks?: MatchupDerbyPick[];
      currentPickIndex?: number;
      totalPicks?: number;
      pickTimer?: number;
      pickDeadline?: Date | null;
      timeoutAction?: number;
      skippedUsers?: string[];
      completedAt?: Date | null;
      metadata?: Record<string, any>;
    },
    client?: PoolClient,
  ): Promise<MatchupDerby | null> {
    const conn = client ?? this.db;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (data.status !== undefined) {
      sets.push(`status = $${idx++}`);
      params.push(data.status);
    }
    if (data.derbyOrder !== undefined) {
      sets.push(`derby_order = $${idx++}`);
      params.push(JSON.stringify(data.derbyOrder));
    }
    if (data.picks !== undefined) {
      sets.push(`picks = $${idx++}`);
      params.push(JSON.stringify(data.picks));
    }
    if (data.currentPickIndex !== undefined) {
      sets.push(`current_pick_index = $${idx++}`);
      params.push(data.currentPickIndex);
    }
    if (data.totalPicks !== undefined) {
      sets.push(`total_picks = $${idx++}`);
      params.push(data.totalPicks);
    }
    if (data.pickTimer !== undefined) {
      sets.push(`pick_timer = $${idx++}`);
      params.push(data.pickTimer);
    }
    if (data.pickDeadline !== undefined) {
      sets.push(`pick_deadline = $${idx++}`);
      params.push(data.pickDeadline);
    }
    if (data.timeoutAction !== undefined) {
      sets.push(`timeout_action = $${idx++}`);
      params.push(data.timeoutAction);
    }
    if (data.skippedUsers !== undefined) {
      sets.push(`skipped_users = $${idx++}`);
      params.push(data.skippedUsers);
    }
    if (data.completedAt !== undefined) {
      sets.push(`completed_at = $${idx++}`);
      params.push(data.completedAt);
    }
    if (data.metadata !== undefined) {
      sets.push(`metadata = $${idx++}`);
      params.push(JSON.stringify(data.metadata));
    }

    if (sets.length === 0) return this.findById(id, client);

    params.push(id);
    const result = await conn.query(
      `UPDATE matchup_derbies SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    return result.rows[0] ? MatchupDerby.fromDatabase(result.rows[0]) : null;
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
}
