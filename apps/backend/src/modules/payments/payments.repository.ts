import { Pool } from 'pg';
import { LeaguePayment } from './payments.model';

export class PaymentRepository {
  constructor(private readonly db: Pool) {}

  async findByLeague(leagueId: string): Promise<LeaguePayment[]> {
    const result = await this.db.query(
      `SELECT lp.*, u.username, recorder.username AS recorded_by_username
       FROM league_payments lp
       JOIN users u ON u.id = lp.user_id
       JOIN users recorder ON recorder.id = lp.recorded_by
       WHERE lp.league_id = $1
       ORDER BY lp.type ASC, lp.created_at DESC`,
      [leagueId]
    );
    return result.rows.map(LeaguePayment.fromDatabase);
  }

  async findById(id: string): Promise<LeaguePayment | null> {
    const result = await this.db.query(
      `SELECT lp.*, u.username, recorder.username AS recorded_by_username
       FROM league_payments lp
       JOIN users u ON u.id = lp.user_id
       JOIN users recorder ON recorder.id = lp.recorded_by
       WHERE lp.id = $1`,
      [id]
    );
    return result.rows.length > 0 ? LeaguePayment.fromDatabase(result.rows[0]) : null;
  }

  async create(data: {
    leagueId: string;
    userId: string;
    type: string;
    amount: number;
    category?: string;
    note?: string;
    recordedBy: string;
  }): Promise<LeaguePayment> {
    const result = await this.db.query(
      `WITH inserted AS (
         INSERT INTO league_payments (league_id, user_id, type, amount, category, note, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *
       )
       SELECT i.*, u.username, recorder.username AS recorded_by_username
       FROM inserted i
       JOIN users u ON u.id = i.user_id
       JOIN users recorder ON recorder.id = i.recorded_by`,
      [data.leagueId, data.userId, data.type, data.amount, data.category ?? null, data.note ?? null, data.recordedBy]
    );
    return LeaguePayment.fromDatabase(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM league_payments WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
