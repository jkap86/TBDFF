import { Pool } from 'pg';
import { League, LeagueMember } from './leagues.model';

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

  async findById(id: string): Promise<League | null> {
    const result = await this.db.query('SELECT * FROM leagues WHERE id = $1', [id]);
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
    const result = await this.db.query('DELETE FROM leagues WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ---- Members ----

  async addMember(leagueId: string, userId: string, role: string): Promise<LeagueMember> {
    const result = await this.db.query(
      `WITH inserted AS (
         INSERT INTO league_members (league_id, user_id, role)
         VALUES ($1, $2, $3)
         RETURNING *
       )
       SELECT inserted.*, u.username
       FROM inserted
       JOIN users u ON u.id = inserted.user_id`,
      [leagueId, userId, role]
    );
    return LeagueMember.fromDatabase(result.rows[0]);
  }

  async findMembersByLeagueId(leagueId: string): Promise<LeagueMember[]> {
    const result = await this.db.query(
      `SELECT lm.*, u.username
       FROM league_members lm
       JOIN users u ON u.id = lm.user_id
       WHERE lm.league_id = $1
       ORDER BY lm.joined_at ASC`,
      [leagueId]
    );
    return result.rows.map(LeagueMember.fromDatabase);
  }

  async findMember(leagueId: string, userId: string): Promise<LeagueMember | null> {
    const result = await this.db.query(
      `SELECT lm.*, u.username
       FROM league_members lm
       JOIN users u ON u.id = lm.user_id
       WHERE lm.league_id = $1 AND lm.user_id = $2`,
      [leagueId, userId]
    );
    return result.rows.length > 0 ? LeagueMember.fromDatabase(result.rows[0]) : null;
  }

  async removeMember(leagueId: string, userId: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM league_members WHERE league_id = $1 AND user_id = $2',
      [leagueId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async updateMemberRole(
    leagueId: string,
    userId: string,
    role: string
  ): Promise<LeagueMember | null> {
    const result = await this.db.query(
      `UPDATE league_members SET role = $1
       WHERE league_id = $2 AND user_id = $3
       RETURNING *`,
      [role, leagueId, userId]
    );
    if (result.rows.length === 0) return null;
    // Re-fetch with username join
    return this.findMember(leagueId, userId);
  }

  async getMemberCount(leagueId: string): Promise<number> {
    const result = await this.db.query(
      'SELECT COUNT(*)::int AS count FROM league_members WHERE league_id = $1',
      [leagueId]
    );
    return result.rows[0].count;
  }
}
