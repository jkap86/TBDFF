export class PlayerStat {
  constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly season: string,
    public readonly week: number,
    public readonly seasonType: string,
    public readonly stats: Record<string, number>,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static fromDatabase(row: any): PlayerStat {
    return new PlayerStat(
      row.id,
      row.player_id,
      row.season,
      row.week,
      row.season_type,
      row.stats || {},
      row.created_at,
      row.updated_at,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      player_id: this.playerId,
      season: this.season,
      week: this.week,
      season_type: this.seasonType,
      stats: this.stats,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}

export class PlayerProjection {
  constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly season: string,
    public readonly week: number,
    public readonly seasonType: string,
    public readonly projections: Record<string, number>,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static fromDatabase(row: any): PlayerProjection {
    return new PlayerProjection(
      row.id,
      row.player_id,
      row.season,
      row.week,
      row.season_type,
      row.projections || {},
      row.created_at,
      row.updated_at,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      player_id: this.playerId,
      season: this.season,
      week: this.week,
      season_type: this.seasonType,
      projections: this.projections,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}
