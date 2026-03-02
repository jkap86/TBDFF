export interface MatchupDerbyOrderEntry {
  user_id: string;
  roster_id: number;
  username: string;
}

export interface MatchupDerbyPick {
  user_id: string;
  picker_roster_id: number;
  opponent_roster_id: number;
  week: number;
  picked_at: string;
}

export class MatchupDerby {
  constructor(
    public readonly id: string,
    public readonly leagueId: string,
    public readonly status: 'pending' | 'active' | 'complete',
    public readonly derbyOrder: MatchupDerbyOrderEntry[],
    public readonly picks: MatchupDerbyPick[],
    public readonly currentPickIndex: number,
    public readonly totalPicks: number,
    public readonly pickTimer: number,
    public readonly pickDeadline: Date | null,
    public readonly timeoutAction: number,
    public readonly skippedUsers: string[],
    public readonly startedAt: Date | null,
    public readonly completedAt: Date | null,
    public readonly metadata: Record<string, any>,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static fromDatabase(row: any): MatchupDerby {
    return new MatchupDerby(
      row.id,
      row.league_id,
      row.status,
      row.derby_order ?? [],
      row.picks ?? [],
      row.current_pick_index,
      row.total_picks,
      row.pick_timer,
      row.pick_deadline ? new Date(row.pick_deadline) : null,
      row.timeout_action,
      row.skipped_users ?? [],
      row.started_at ? new Date(row.started_at) : null,
      row.completed_at ? new Date(row.completed_at) : null,
      row.metadata ?? {},
      new Date(row.created_at),
      new Date(row.updated_at),
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      league_id: this.leagueId,
      status: this.status,
      derby_order: this.derbyOrder,
      picks: this.picks,
      current_pick_index: this.currentPickIndex,
      total_picks: this.totalPicks,
      pick_timer: this.pickTimer,
      pick_deadline: this.pickDeadline?.toISOString() ?? null,
      timeout_action: this.timeoutAction,
      skipped_users: this.skippedUsers,
      started_at: this.startedAt?.toISOString() ?? null,
      completed_at: this.completedAt?.toISOString() ?? null,
    };
  }
}
