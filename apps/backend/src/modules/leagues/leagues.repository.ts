import { Pool, PoolClient } from 'pg';
import { League, LeagueMember, LeagueInvite, Roster } from './leagues.model';

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

  // ---- Rosters ----

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

  async findRostersByLeagueId(leagueId: string): Promise<Roster[]> {
    const result = await this.db.query(
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

  async findRosterByOwner(leagueId: string, ownerId: string): Promise<Roster | null> {
    const result = await this.db.query(
      `SELECT * FROM rosters WHERE league_id = $1 AND owner_id = $2`,
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

  // ---- Transactional operations ----

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
      // 1. Insert league
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

      // 2. Add creator as commissioner
      await client.query(
        `INSERT INTO league_members (league_id, user_id, role) VALUES ($1, $2, $3)`,
        [league.id, data.createdBy, 'commissioner']
      );

      // 3. Create roster slots
      await client.query(
        `INSERT INTO rosters (roster_id, league_id)
         SELECT s, $1 FROM generate_series(1, $2) AS s`,
        [league.id, data.totalRosters]
      );

      // 4. Assign commissioner to roster 1
      await client.query(
        `UPDATE rosters SET owner_id = $1 WHERE league_id = $2 AND roster_id = $3`,
        [data.createdBy, league.id, 1]
      );

      return league;
    });
  }

  async acceptInviteTransaction(
    leagueId: string,
    userId: string,
    inviteId: string,
  ): Promise<LeagueMember> {
    return this.withTransaction(async (client) => {
      // 1. Add user as spectator
      const memberResult = await client.query(
        `WITH inserted AS (
           INSERT INTO league_members (league_id, user_id, role)
           VALUES ($1, $2, $3)
           RETURNING *
         )
         SELECT inserted.*, u.username
         FROM inserted
         JOIN users u ON u.id = inserted.user_id`,
        [leagueId, userId, 'spectator']
      );

      // 2. Mark invite as accepted
      await client.query(
        `UPDATE league_invites SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
        [inviteId]
      );

      return LeagueMember.fromDatabase(memberResult.rows[0]);
    });
  }

  async removeMemberTransaction(leagueId: string, userId: string): Promise<void> {
    return this.withTransaction(async (client) => {
      await client.query(
        `UPDATE rosters SET owner_id = NULL WHERE league_id = $1 AND owner_id = $2`,
        [leagueId, userId]
      );
      await client.query(
        `DELETE FROM league_members WHERE league_id = $1 AND user_id = $2`,
        [leagueId, userId]
      );
    });
  }

  async assignRosterOwnerTransaction(
    leagueId: string,
    rosterId: number,
    userId: string,
  ): Promise<{ roster: Roster; member: LeagueMember }> {
    return this.withTransaction(async (client) => {
      // 1. Assign roster
      const rosterResult = await client.query(
        `UPDATE rosters SET owner_id = $1 WHERE league_id = $2 AND roster_id = $3 RETURNING *`,
        [userId, leagueId, rosterId]
      );
      if (rosterResult.rows.length === 0) {
        throw new Error('Roster not found');
      }

      // 2. Promote to member
      await client.query(
        `UPDATE league_members SET role = 'member' WHERE league_id = $1 AND user_id = $2 AND role = 'spectator'`,
        [leagueId, userId]
      );

      // Re-fetch member with username
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
