export class Matchup {
  constructor(
    public readonly id: string,
    public readonly leagueId: string,
    public readonly week: number,
    public readonly matchupId: number,
    public readonly rosterId: number,
    public readonly points: number,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static fromDatabase(row: any): Matchup {
    return new Matchup(
      row.id,
      row.league_id,
      row.week,
      row.matchup_id,
      row.roster_id,
      parseFloat(row.points),
      row.created_at,
      row.updated_at,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      league_id: this.leagueId,
      week: this.week,
      matchup_id: this.matchupId,
      roster_id: this.rosterId,
      points: this.points,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}
