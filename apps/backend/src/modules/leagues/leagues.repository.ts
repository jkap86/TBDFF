import { Pool, PoolClient } from 'pg';
import { League } from './leagues.model';

export class LeagueRepository {
  constructor(private readonly db: Pool) {}

  async create(data: {
    name: string;
    sport: string;
    season: string;
    totalRosters: number;
    settings: object;
    scoringSettings: object;
    rosterPositions: string[];
    createdBy: string;
  }): Promise<League> {
    const result = await this.db.query(
      `INSERT INTO leagues (name, sport, season, total_rosters, settings, scoring_settings, roster_positions, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.name,
        data.sport,
        data.season,
        data.totalRosters,
        JSON.stringify(data.settings),
        JSON.stringify(data.scoringSettings),
        data.rosterPositions,
        data.createdBy,
      ]
    );
    return League.fromDatabase(result.rows[0]);
  }

  async findById(id: string, client?: PoolClient): Promise<League | null> {
    const conn = client ?? this.db;
    const result = await conn.query('SELECT * FROM leagues WHERE id = $1', [id]);
    return result.rows.length > 0 ? League.fromDatabase(result.rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<League[]> {
    const result = await this.db.query(
      `SELECT l.* FROM leagues l
       INNER JOIN league_members lm ON lm.league_id = l.id
       WHERE lm.user_id = $1
       ORDER BY l.created_at DESC`,
      [userId]
    );
    return result.rows.map(League.fromDatabase);
  }

  async update(id: string, data: Record<string, any>): Promise<League | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const columnMap: Record<string, string> = {
      name: 'name',
      seasonType: 'season_type',
      status: 'status',
      totalRosters: 'total_rosters',
      avatar: 'avatar',
      settings: 'settings',
      scoringSettings: 'scoring_settings',
      rosterPositions: 'roster_positions',
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if (data[key] !== undefined) {
        fields.push(`${column} = $${paramIndex}`);
        const val =
          key === 'settings' || key === 'scoringSettings'
            ? JSON.stringify(data[key])
            : data[key];
        values.push(val);
        paramIndex++;
      }
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    const result = await this.db.query(
      `UPDATE leagues SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows.length > 0 ? League.fromDatabase(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    await this.db.query('DELETE FROM trade_proposals WHERE league_id = $1', [id]);
    const result = await this.db.query('DELETE FROM leagues WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ---- Public Leagues ----

  async findPublicLeagues(limit: number, offset: number): Promise<Array<any>> {
    const result = await this.db.query(
      `WITH league_member_counts AS (
        SELECT league_id, COUNT(*)::int AS member_count
        FROM league_members
        GROUP BY league_id
      )
      SELECT
        l.id,
        l.name,
        l.sport,
        l.season,
        l.status,
        l.total_rosters,
        l.avatar,
        l.settings,
        l.roster_positions,
        COALESCE(lmc.member_count, 0) AS member_count
      FROM leagues l
      LEFT JOIN league_member_counts lmc ON lmc.league_id = l.id
      WHERE (l.settings->>'public')::int = 1
      ORDER BY l.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows;
  }

  async countPublicLeagues(): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS count
       FROM leagues
       WHERE (settings->>'public')::int = 1`
    );
    return result.rows[0].count;
  }

  // ---- Transactional league creation ----

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

  async createLeagueWithDefaults(data: {
    name: string;
    sport: string;
    season: string;
    totalRosters: number;
    settings: object;
    scoringSettings: object;
    rosterPositions: string[];
    createdBy: string;
  }): Promise<League> {
    return this.withTransaction(async (client) => {
      const leagueResult = await client.query(
        `INSERT INTO leagues (name, sport, season, total_rosters, settings, scoring_settings, roster_positions, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          data.name,
          data.sport,
          data.season,
          data.totalRosters,
          JSON.stringify(data.settings),
          JSON.stringify(data.scoringSettings),
          data.rosterPositions,
          data.createdBy,
        ]
      );
      const league = League.fromDatabase(leagueResult.rows[0]);

      await client.query(
        `INSERT INTO league_members (league_id, user_id, role) VALUES ($1, $2, $3)`,
        [league.id, data.createdBy, 'commissioner']
      );

      await client.query(
        `INSERT INTO rosters (roster_id, league_id)
         SELECT s, $1 FROM generate_series(1, $2) AS s`,
        [league.id, data.totalRosters]
      );

      await client.query(
        `UPDATE rosters SET owner_id = $1 WHERE league_id = $2 AND roster_id = $3`,
        [data.createdBy, league.id, 1]
      );

      return league;
    });
  }
}
