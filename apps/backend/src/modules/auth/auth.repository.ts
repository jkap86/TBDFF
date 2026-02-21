import { Pool } from 'pg';
import { User } from './auth.model';

export class UserRepository {
  constructor(private readonly db: Pool) {}

  async findByUsername(username: string): Promise<User | null> {
    const result = await this.db.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    return result.rows.length > 0 ? User.fromDatabase(result.rows[0]) : null;
  }

  async findById(userId: string): Promise<User | null> {
    const result = await this.db.query('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows.length > 0 ? User.fromDatabase(result.rows[0]) : null;
  }

  async create(username: string, displayUsername: string, email: string, passwordHash: string): Promise<User> {
    const result = await this.db.query(
      `INSERT INTO users (username, display_username, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [username, displayUsername, email, passwordHash]
    );
    return User.fromDatabase(result.rows[0]);
  }

  async usernameExists(username: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(username) = LOWER($1))',
      [username]
    );
    return result.rows[0].exists;
  }

  async emailExists(email: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email) = LOWER($1))',
      [email]
    );
    return result.rows[0].exists;
  }

  async updateRefreshToken(userId: string, hashedToken: string, expiresAt: Date): Promise<void> {
    await this.db.query(
      `UPDATE users SET refresh_token = $1, refresh_token_expires_at = $2 WHERE id = $3`,
      [hashedToken, expiresAt, userId]
    );
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET refresh_token = NULL, refresh_token_expires_at = NULL WHERE id = $1`,
      [userId]
    );
  }

  async getRefreshTokenWithExpiry(
    userId: string
  ): Promise<{ token: string | null; expiresAt: Date | null }> {
    const result = await this.db.query(
      'SELECT refresh_token, refresh_token_expires_at FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      return { token: null, expiresAt: null };
    }
    return {
      token: result.rows[0].refresh_token,
      expiresAt: result.rows[0].refresh_token_expires_at,
    };
  }
}
