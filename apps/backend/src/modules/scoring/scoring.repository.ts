import { Pool } from 'pg';
import { PlayerStat, PlayerProjection } from './scoring.model';

export class ScoringRepository {
  constructor(private readonly db: Pool) {}

  // --- Stats ---

  async findStatsByPlayerIds(
    playerIds: string[],
    season: string,
    week: number,
    seasonType: string,
  ): Promise<PlayerStat[]> {
    if (playerIds.length === 0) return [];
    const result = await this.db.query(
      `SELECT * FROM player_stats
       WHERE player_id = ANY($1) AND season = $2 AND week = $3 AND season_type = $4`,
      [playerIds, season, week, seasonType],
    );
    return result.rows.map(PlayerStat.fromDatabase);
  }

  async findStatsByWeek(
    season: string,
    week: number,
    seasonType: string,
  ): Promise<PlayerStat[]> {
    const result = await this.db.query(
      `SELECT * FROM player_stats
       WHERE season = $1 AND week = $2 AND season_type = $3`,
      [season, week, seasonType],
    );
    return result.rows.map(PlayerStat.fromDatabase);
  }

  async bulkUpsertStats(
    rows: Array<{
      playerId: string;
      season: string;
      week: number;
      seasonType: string;
      stats: Record<string, number>;
    }>,
  ): Promise<number> {
    if (rows.length === 0) return 0;

    const BATCH_SIZE = 50;
    let totalUpserted = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values: any[] = [];
      const placeholders: string[] = [];

      batch.forEach((row, idx) => {
        const offset = idx * 5;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`,
        );
        values.push(row.playerId, row.season, row.week, row.seasonType, JSON.stringify(row.stats));
      });

      const result = await this.db.query(
        `INSERT INTO player_stats (player_id, season, week, season_type, stats)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (player_id, season, week, season_type) DO UPDATE SET
           stats = EXCLUDED.stats,
           updated_at = NOW()`,
        values,
      );
      totalUpserted += result.rowCount ?? 0;
    }

    return totalUpserted;
  }

  // --- Projections ---

  async findProjectionsByPlayerIds(
    playerIds: string[],
    season: string,
    week: number,
    seasonType: string,
  ): Promise<PlayerProjection[]> {
    if (playerIds.length === 0) return [];
    const result = await this.db.query(
      `SELECT * FROM player_projections
       WHERE player_id = ANY($1) AND season = $2 AND week = $3 AND season_type = $4`,
      [playerIds, season, week, seasonType],
    );
    return result.rows.map(PlayerProjection.fromDatabase);
  }

  async findProjectionsByWeek(
    season: string,
    week: number,
    seasonType: string,
  ): Promise<PlayerProjection[]> {
    const result = await this.db.query(
      `SELECT * FROM player_projections
       WHERE season = $1 AND week = $2 AND season_type = $3`,
      [season, week, seasonType],
    );
    return result.rows.map(PlayerProjection.fromDatabase);
  }

  async bulkUpsertProjections(
    rows: Array<{
      playerId: string;
      season: string;
      week: number;
      seasonType: string;
      projections: Record<string, number>;
    }>,
  ): Promise<number> {
    if (rows.length === 0) return 0;

    const BATCH_SIZE = 50;
    let totalUpserted = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values: any[] = [];
      const placeholders: string[] = [];

      batch.forEach((row, idx) => {
        const offset = idx * 5;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`,
        );
        values.push(
          row.playerId,
          row.season,
          row.week,
          row.seasonType,
          JSON.stringify(row.projections),
        );
      });

      const result = await this.db.query(
        `INSERT INTO player_projections (player_id, season, week, season_type, projections)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (player_id, season, week, season_type) DO UPDATE SET
           projections = EXCLUDED.projections,
           updated_at = NOW()`,
        values,
      );
      totalUpserted += result.rowCount ?? 0;
    }

    return totalUpserted;
  }

  // --- Bye Weeks ---

  async upsertByeWeeks(
    rows: Array<{ season: string; team: string; byeWeek: number }>,
  ): Promise<number> {
    if (rows.length === 0) return 0;

    const values: any[] = [];
    const placeholders: string[] = [];

    rows.forEach((row, idx) => {
      const offset = idx * 3;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
      values.push(row.season, row.team, row.byeWeek);
    });

    const result = await this.db.query(
      `INSERT INTO nfl_bye_weeks (season, team, bye_week)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (season, team) DO UPDATE SET
         bye_week = EXCLUDED.bye_week`,
      values,
    );
    return result.rowCount ?? 0;
  }
}
