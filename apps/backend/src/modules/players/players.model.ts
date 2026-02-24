export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | 'DL' | 'LB' | 'DB';
export type InjuryStatus = 'Out' | 'Doubtful' | 'Questionable' | 'Probable';

export class Player {
  constructor(
    public readonly id: string,
    public readonly firstName: string | null,
    public readonly lastName: string | null,
    public readonly fullName: string,
    public readonly position: Position | null,
    public readonly fantasyPositions: string[],
    public readonly team: string | null,
    public readonly active: boolean,
    public readonly injuryStatus: InjuryStatus | null,
    public readonly yearsExp: number | null,
    public readonly age: number | null,
    public readonly jerseyNumber: number | null,
    public readonly searchRank: number | null,
    public readonly auctionValue: number | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  static fromDatabase(row: any): Player {
    return new Player(
      row.id,
      row.first_name,
      row.last_name,
      row.full_name,
      row.position,
      row.fantasy_positions || [],
      row.team,
      row.active ?? true,
      row.injury_status,
      row.years_exp,
      row.age,
      row.jersey_number,
      row.search_rank ?? null,
      row.auction_value ?? null,
      new Date(row.created_at),
      new Date(row.updated_at)
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      first_name: this.firstName,
      last_name: this.lastName,
      full_name: this.fullName,
      position: this.position,
      fantasy_positions: this.fantasyPositions,
      team: this.team,
      active: this.active,
      injury_status: this.injuryStatus,
      years_exp: this.yearsExp,
      age: this.age,
      jersey_number: this.jerseyNumber,
      search_rank: this.searchRank,
      auction_value: this.auctionValue,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
    };
  }

  isEligibleForPosition(position: string): boolean {
    return this.fantasyPositions.includes(position) || this.position === position;
  }

  isInjured(): boolean {
    return this.injuryStatus !== null;
  }
}
