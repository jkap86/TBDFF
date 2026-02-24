import { Pool } from 'pg';
import { Player } from './players.model';

export class PlayerRepository {
  constructor(private readonly db: Pool) {}

  async findAll(limit: number = 1000, offset: number = 0): Promise<Player[]> {
    const result = await this.db.query(
      'SELECT * FROM players ORDER BY full_name LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows.map(Player.fromDatabase);
  }

  async findById(id: string): Promise<Player | null> {
    const result = await this.db.query('SELECT * FROM players WHERE id = $1', [id]);
    return result.rows.length > 0 ? Player.fromDatabase(result.rows[0]) : null;
  }

  async search(query: string, limit: number = 50): Promise<Player[]> {
    const result = await this.db.query(
      `SELECT * FROM players
       WHERE full_name ILIKE $1 OR last_name ILIKE $1
       ORDER BY full_name
       LIMIT $2`,
      [`%${query}%`, limit]
    );
    return result.rows.map(Player.fromDatabase);
  }

  async findByPosition(position: string): Promise<Player[]> {
    const result = await this.db.query(
      'SELECT * FROM players WHERE position = $1 ORDER BY full_name',
      [position]
    );
    return result.rows.map(Player.fromDatabase);
  }

  async findByTeam(team: string): Promise<Player[]> {
    const result = await this.db.query(
      'SELECT * FROM players WHERE team = $1 ORDER BY position, full_name',
      [team]
    );
    return result.rows.map(Player.fromDatabase);
  }

  // Sync-related methods (internal use only)
  async upsertPlayer(data: {
    id?: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
    position: string | null;
    fantasyPositions: string[];
    team: string | null;
    active: boolean;
    injuryStatus: string | null;
    yearsExp: number | null;
    age: number | null;
    jerseyNumber: number | null;
    searchRank: number | null;
  }): Promise<Player> {
    const result = await this.db.query(
      `INSERT INTO players (
        id, first_name, last_name, full_name, position, fantasy_positions,
        team, active, injury_status, years_exp, age, jersey_number, search_rank
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        full_name = EXCLUDED.full_name,
        position = EXCLUDED.position,
        fantasy_positions = EXCLUDED.fantasy_positions,
        team = EXCLUDED.team,
        active = EXCLUDED.active,
        injury_status = EXCLUDED.injury_status,
        years_exp = EXCLUDED.years_exp,
        age = EXCLUDED.age,
        jersey_number = EXCLUDED.jersey_number,
        search_rank = EXCLUDED.search_rank,
        updated_at = NOW()
      RETURNING *`,
      [
        data.id || null,
        data.firstName,
        data.lastName,
        data.fullName,
        data.position,
        data.fantasyPositions,
        data.team,
        data.active,
        data.injuryStatus,
        data.yearsExp,
        data.age,
        data.jerseyNumber,
        data.searchRank,
      ]
    );
    return Player.fromDatabase(result.rows[0]);
  }

  async findByIds(ids: string[]): Promise<Player[]> {
    if (ids.length === 0) return [];
    const result = await this.db.query(
      'SELECT * FROM players WHERE id = ANY($1)',
      [ids],
    );
    return result.rows.map(Player.fromDatabase);
  }

  async findByExternalId(provider: string, externalId: string): Promise<Player | null> {
    const result = await this.db.query(
      `SELECT p.* FROM players p
       JOIN player_external_ids e ON p.id = e.player_id
       WHERE e.provider = $1 AND e.external_id = $2`,
      [provider, externalId]
    );
    return result.rows.length > 0 ? Player.fromDatabase(result.rows[0]) : null;
  }

  async findPlayerIdsByExternalIds(
    provider: string,
    externalIds: string[],
  ): Promise<Map<string, string>> {
    if (externalIds.length === 0) return new Map();
    const result = await this.db.query(
      `SELECT player_id, external_id FROM player_external_ids
       WHERE provider = $1 AND external_id = ANY($2)`,
      [provider, externalIds],
    );
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.external_id, row.player_id);
    }
    return map;
  }

  async linkExternalId(playerId: string, provider: string, externalId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO player_external_ids (player_id, provider, external_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (player_id, provider) DO UPDATE SET
         external_id = EXCLUDED.external_id`,
      [playerId, provider, externalId]
    );
  }

  /**
   * Bulk-compute auction_value for all players with a search_rank.
   * VBD formula: max(1, round(55 * e^(-0.022 * rank) + 0.5))
   * Based on $200 budget, 12-team league. Top ~180 sum ≈ $2400.
   */
  async computeAuctionValues(): Promise<number> {
    const result = await this.db.query(
      `UPDATE players
       SET auction_value = GREATEST(1, ROUND(55 * EXP(-0.022 * search_rank) + 0.5)::int)
       WHERE search_rank IS NOT NULL
       RETURNING id`
    );
    return result.rowCount ?? 0;
  }
}
