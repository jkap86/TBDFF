import { Pool, PoolClient } from 'pg';
import { LeagueMember, LeagueInvite } from './leagues.model';

export class LeagueMembersRepository {
  constructor(private readonly db: Pool) {}

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
    return this.findMember(leagueId, userId);
  }

  async getMemberCount(leagueId: string): Promise<number> {
    const result = await this.db.query(
      'SELECT COUNT(*)::int AS count FROM league_members WHERE league_id = $1',
      [leagueId]
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
    return this.findInviteById(inviteId);
  }

  async deleteInvite(inviteId: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM league_invites WHERE id = $1',
      [inviteId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findUserByUsername(username: string): Promise<{ id: string; username: string } | null> {
    const result = await this.db.query(
      'SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // ---- Transactional member operations ----

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

  async acceptInviteTransaction(
    leagueId: string,
    userId: string,
    inviteId: string,
  ): Promise<LeagueMember> {
    return this.withTransaction(async (client) => {
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
}
