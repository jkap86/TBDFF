import { Pool } from 'pg';
import { Matchup } from './matchups.model';

export class MatchupRepository {
  constructor(private readonly db: Pool) {}

  async findByLeagueId(leagueId: string): Promise<Matchup[]> {
    const result = await this.db.query(
      `SELECT * FROM matchups
       WHERE league_id = $1
       ORDER BY week ASC, matchup_id ASC, roster_id ASC`,
      [leagueId]
    );
    return result.rows.map(Matchup.fromDatabase);
  }

  async findByLeagueAndWeek(leagueId: string, week: number): Promise<Matchup[]> {
    const result = await this.db.query(
      `SELECT * FROM matchups
       WHERE league_id = $1 AND week = $2
       ORDER BY matchup_id ASC, roster_id ASC`,
      [leagueId, week]
    );
    return result.rows.map(Matchup.fromDatabase);
  }

  async deleteByLeagueId(leagueId: string): Promise<number> {
    const result = await this.db.query(
      'DELETE FROM matchups WHERE league_id = $1',
      [leagueId]
    );
    return result.rowCount ?? 0;
  }

  async bulkInsert(
    leagueId: string,
    rows: Array<{ week: number; matchup_id: number; roster_id: number }>
  ): Promise<Matchup[]> {
    if (rows.length === 0) return [];

    const values: string[] = [];
    const params: any[] = [leagueId];
    let paramIdx = 2;

    for (const row of rows) {
      values.push(`($1, $${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2})`);
      params.push(row.week, row.matchup_id, row.roster_id);
      paramIdx += 3;
    }

    const result = await this.db.query(
      `INSERT INTO matchups (league_id, week, matchup_id, roster_id)
       VALUES ${values.join(', ')}
       RETURNING *`,
      params
    );
    return result.rows.map(Matchup.fromDatabase);
  }
}
