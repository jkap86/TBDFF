import { Pool, PoolClient } from 'pg';
import { LeagueMember, Roster } from './leagues.model';
import { ConflictException, NotFoundException } from '../../shared/exceptions';

export class LeagueRostersRepository {
  constructor(private readonly db: Pool) {}

  async createRosters(leagueId: string, count: number): Promise<Roster[]> {
    const result = await this.db.query(
      `INSERT INTO rosters (roster_id, league_id)
       SELECT s, $1
       FROM generate_series(1, $2) AS s
       RETURNING *`,
      [leagueId, count]
    );
    return result.rows.map(Roster.fromDatabase);
  }

  async addRosters(leagueId: string, currentCount: number, newCount: number): Promise<void> {
    if (newCount <= currentCount) return;
    await this.db.query(
      `INSERT INTO rosters (roster_id, league_id)
       SELECT s, $1
       FROM generate_series($2::int, $3::int) AS s`,
      [leagueId, currentCount + 1, newCount]
    );
  }

  async removeEmptyRosters(leagueId: string, keepCount: number): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM rosters
       WHERE league_id = $1 AND owner_id IS NULL AND roster_id > $2`,
      [leagueId, keepCount]
    );
    return result.rowCount ?? 0;
  }

  async findRostersByLeagueId(leagueId: string, client?: PoolClient): Promise<Roster[]> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `SELECT * FROM rosters WHERE league_id = $1 ORDER BY roster_id ASC`,
      [leagueId]
    );
    return result.rows.map(Roster.fromDatabase);
  }

  async assignRosterOwner(leagueId: string, rosterId: number, ownerId: string): Promise<Roster | null> {
    const result = await this.db.query(
      `UPDATE rosters SET owner_id = $1
       WHERE league_id = $2 AND roster_id = $3
       RETURNING *`,
      [ownerId, leagueId, rosterId]
    );
    return result.rows.length > 0 ? Roster.fromDatabase(result.rows[0]) : null;
  }

  async findAvailableRoster(leagueId: string): Promise<Roster | null> {
    const result = await this.db.query(
      `SELECT * FROM rosters
       WHERE league_id = $1 AND owner_id IS NULL
       ORDER BY roster_id ASC
       LIMIT 1`,
      [leagueId]
    );
    return result.rows.length > 0 ? Roster.fromDatabase(result.rows[0]) : null;
  }

  async findRosterByOwner(leagueId: string, ownerId: string, client?: PoolClient): Promise<Roster | null> {
    const conn = client ?? this.db;
    const result = await conn.query(
      `SELECT * FROM rosters WHERE league_id = $1 AND owner_id = $2`,
      [leagueId, ownerId]
    );
    return result.rows.length > 0 ? Roster.fromDatabase(result.rows[0]) : null;
  }

  async findRosterByOwnerForUpdate(leagueId: string, ownerId: string, client: PoolClient): Promise<Roster | null> {
    const result = await client.query(
      `SELECT * FROM rosters WHERE league_id = $1 AND owner_id = $2 FOR UPDATE`,
      [leagueId, ownerId]
    );
    return result.rows.length > 0 ? Roster.fromDatabase(result.rows[0]) : null;
  }

  async unassignRosterOwner(leagueId: string, ownerId: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE rosters SET owner_id = NULL
       WHERE league_id = $1 AND owner_id = $2`,
      [leagueId, ownerId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ---- Transactional roster operations ----

  private async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
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

  async assignRosterOwnerTransaction(
    leagueId: string,
    rosterId: number,
    userId: string,
  ): Promise<{ roster: Roster; member: LeagueMember }> {
    return this.withTransaction(async (client) => {
      // Lock the target roster row to prevent concurrent assignment races
      const lockResult = await client.query(
        `SELECT owner_id FROM rosters WHERE league_id = $1 AND roster_id = $2 FOR UPDATE`,
        [leagueId, rosterId]
      );
      if (lockResult.rows.length === 0) {
        throw new NotFoundException('Roster not found');
      }
      if (lockResult.rows[0].owner_id !== null) {
        throw new ConflictException('Roster is already assigned');
      }

      // Re-check inside the transaction that the user does not already own a roster
      const existing = await client.query(
        `SELECT 1 FROM rosters WHERE league_id = $1 AND owner_id = $2 FOR UPDATE`,
        [leagueId, userId]
      );
      if (existing.rows.length > 0) {
        throw new ConflictException('User is already assigned to a roster');
      }

      const rosterResult = await client.query(
        `UPDATE rosters SET owner_id = $1
         WHERE league_id = $2 AND roster_id = $3 AND owner_id IS NULL
         RETURNING *`,
        [userId, leagueId, rosterId]
      );
      if (rosterResult.rows.length === 0) {
        throw new ConflictException('Roster is already assigned');
      }

      await client.query(
        `UPDATE league_members SET role = 'member' WHERE league_id = $1 AND user_id = $2 AND role = 'spectator'`,
        [leagueId, userId]
      );

      const memberResult = await client.query(
        `SELECT lm.*, u.username FROM league_members lm JOIN users u ON u.id = lm.user_id
         WHERE lm.league_id = $1 AND lm.user_id = $2`,
        [leagueId, userId]
      );

      return {
        roster: Roster.fromDatabase(rosterResult.rows[0]),
        member: LeagueMember.fromDatabase(memberResult.rows[0]),
      };
    });
  }

  async updateStarters(leagueId: string, rosterId: number, starters: string[]): Promise<Roster> {
    const result = await this.db.query(
      `UPDATE rosters SET starters = $1, updated_at = NOW()
       WHERE league_id = $2 AND roster_id = $3
       RETURNING *`,
      [JSON.stringify(starters), leagueId, rosterId]
    );
    if (result.rows.length === 0) throw new Error('Roster not found');
    return Roster.fromDatabase(result.rows[0]);
  }

  async unassignRosterOwnerTransaction(leagueId: string, userId: string): Promise<void> {
    return this.withTransaction(async (client) => {
      await client.query(
        `UPDATE rosters SET owner_id = NULL WHERE league_id = $1 AND owner_id = $2`,
        [leagueId, userId]
      );
      await client.query(
        `UPDATE league_members SET role = 'spectator' WHERE league_id = $1 AND user_id = $2`,
        [leagueId, userId]
      );
    });
  }
}
