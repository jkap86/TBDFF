export type PaymentType = 'buy_in' | 'payout';

export class LeaguePayment {
  constructor(
    public readonly id: string,
    public readonly leagueId: string,
    public readonly userId: string,
    public readonly type: PaymentType,
    public readonly amount: number,
    public readonly note: string | null,
    public readonly recordedBy: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly username?: string,
    public readonly recordedByUsername?: string,
  ) {}

  static fromDatabase(row: any): LeaguePayment {
    return new LeaguePayment(
      row.id,
      row.league_id,
      row.user_id,
      row.type,
      parseFloat(row.amount),
      row.note,
      row.recorded_by,
      row.created_at,
      row.updated_at,
      row.username,
      row.recorded_by_username,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      league_id: this.leagueId,
      user_id: this.userId,
      type: this.type,
      amount: this.amount,
      note: this.note,
      recorded_by: this.recordedBy,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
      username: this.username,
      recorded_by_username: this.recordedByUsername,
    };
  }
}
