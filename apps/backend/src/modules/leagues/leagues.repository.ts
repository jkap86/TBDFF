import { Pool } from 'pg';
import { League, LeagueMember, LeagueInvite } from './leagues.model';

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

  // ---- League Invites ----

  async createInvite(
    leagueId: string,
    inviterId: string,
    inviteeId: string
  ): Promise<LeagueInvite> {
    const result = await this.db.query(
      `WITH inserted AS (
        INSERT INTO league_invites (league_id, inviter_id, invitee_id, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING *
      )
      SELECT
        i.*,
        u1.username AS inviter_username,
        u2.username AS invitee_username,
        l.name AS league_name
      FROM inserted i
      JOIN users u1 ON u1.id = i.inviter_id
      JOIN users u2 ON u2.id = i.invitee_id
      JOIN leagues l ON l.id = i.league_id`,
      [leagueId, inviterId, inviteeId]
    );
    return LeagueInvite.fromDatabase(result.rows[0]);
  }

  async findInviteById(inviteId: string): Promise<LeagueInvite | null> {
    const result = await this.db.query(
      `SELECT
        li.*,
        u1.username AS inviter_username,
        u2.username AS invitee_username,
        l.name AS league_name
      FROM league_invites li
      JOIN users u1 ON u1.id = li.inviter_id
      JOIN users u2 ON u2.id = li.invitee_id
      JOIN leagues l ON l.id = li.league_id
      WHERE li.id = $1`,
      [inviteId]
    );
    return result.rows.length > 0 ? LeagueInvite.fromDatabase(result.rows[0]) : null;
  }

  async findPendingInvitesByLeague(leagueId: string): Promise<LeagueInvite[]> {
    const result = await this.db.query(
      `SELECT
        li.*,
        u1.username AS inviter_username,
        u2.username AS invitee_username,
        l.name AS league_name
      FROM league_invites li
      JOIN users u1 ON u1.id = li.inviter_id
      JOIN users u2 ON u2.id = li.invitee_id
      JOIN leagues l ON l.id = li.league_id
      WHERE li.league_id = $1 AND li.status = 'pending'
      ORDER BY li.created_at DESC`,
      [leagueId]
    );
    return result.rows.map(LeagueInvite.fromDatabase);
  }

  async findPendingInvitesByUser(userId: string): Promise<LeagueInvite[]> {
    const result = await this.db.query(
      `SELECT
        li.*,
        u1.username AS inviter_username,
        u2.username AS invitee_username,
        l.name AS league_name
      FROM league_invites li
      JOIN users u1 ON u1.id = li.inviter_id
      JOIN users u2 ON u2.id = li.invitee_id
      JOIN leagues l ON l.id = li.league_id
      WHERE li.invitee_id = $1 AND li.status = 'pending'
      ORDER BY li.created_at DESC`,
      [userId]
    );
    return result.rows.map(LeagueInvite.fromDatabase);
  }

  async findExistingInvite(
    leagueId: string,
    inviteeId: string
  ): Promise<LeagueInvite | null> {
    const result = await this.db.query(
      `SELECT
        li.*,
        u1.username AS inviter_username,
        u2.username AS invitee_username,
        l.name AS league_name
      FROM league_invites li
      JOIN users u1 ON u1.id = li.inviter_id
      JOIN users u2 ON u2.id = li.invitee_id
      JOIN leagues l ON l.id = li.league_id
      WHERE li.league_id = $1 AND li.invitee_id = $2`,
      [leagueId, inviteeId]
    );
    return result.rows.length > 0 ? LeagueInvite.fromDatabase(result.rows[0]) : null;
  }

  async updateInviteStatus(
    inviteId: string,
    status: 'accepted' | 'declined'
  ): Promise<LeagueInvite | null> {
    const result = await this.db.query(
      `UPDATE league_invites
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, inviteId]
    );
    if (result.rows.length === 0) return null;
    // Re-fetch with joins
    return this.findInviteById(inviteId);
  }

  async deleteInvite(inviteId: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM league_invites WHERE id = $1',
      [inviteId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Helper: Find user by username (needed for invite creation)
  async findUserByUsername(username: string): Promise<{ id: string; username: string } | null> {
    const result = await this.db.query(
      'SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}
