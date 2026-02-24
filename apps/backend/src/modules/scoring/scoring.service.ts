import { ScoringRepository } from './scoring.repository';
import { PlayerRepository } from '../players/players.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { StatsDataProvider, GameData } from '../../integrations/shared/stats-data-provider.interface';
import { calculateFantasyPoints, calculateLivePoints, GameStatus } from './scoring-calculator';
import { NotFoundException, ForbiddenException } from '../../shared/exceptions';

export class ScoringService {
  constructor(
    private readonly scoringRepository: ScoringRepository,
    private readonly playerRepository: PlayerRepository,
    private readonly leagueRepository: LeagueRepository,
    private readonly statsProvider: StatsDataProvider,
  ) {}

  // --- Sync operations (called by job or manual trigger) ---

  async syncWeeklyStats(
    season: string,
    week: number,
    seasonType: string,
  ): Promise<{ synced: number; skipped: number }> {
    const weeklyStats = await this.statsProvider.fetchWeeklyStats(season, week, seasonType);

    // Batch resolve external IDs to internal player IDs
    const externalIds = weeklyStats.map((d) => d.externalPlayerId);
    const idMap = await this.playerRepository.findPlayerIdsByExternalIds(
      this.statsProvider.providerName,
      externalIds,
    );

    const rows: Array<{
      playerId: string;
      season: string;
      week: number;
      seasonType: string;
      stats: Record<string, number>;
    }> = [];
    let skipped = 0;

    for (const data of weeklyStats) {
      const playerId = idMap.get(data.externalPlayerId);
      if (!playerId) {
        skipped++;
        continue;
      }
      rows.push({ playerId, season, week, seasonType, stats: data.stats });
    }

    const synced = await this.scoringRepository.bulkUpsertStats(rows);
    return { synced, skipped };
  }

  async syncWeeklyProjections(
    season: string,
    week: number,
    seasonType: string,
  ): Promise<{ synced: number; skipped: number }> {
    const weeklyProjections = await this.statsProvider.fetchWeeklyProjections(
      season,
      week,
      seasonType,
    );

    const externalIds = weeklyProjections.map((d) => d.externalPlayerId);
    const idMap = await this.playerRepository.findPlayerIdsByExternalIds(
      this.statsProvider.providerName,
      externalIds,
    );

    const rows: Array<{
      playerId: string;
      season: string;
      week: number;
      seasonType: string;
      projections: Record<string, number>;
    }> = [];
    let skipped = 0;

    for (const data of weeklyProjections) {
      const playerId = idMap.get(data.externalPlayerId);
      if (!playerId) {
        skipped++;
        continue;
      }
      rows.push({ playerId, season, week, seasonType, projections: data.stats });
    }

    const synced = await this.scoringRepository.bulkUpsertProjections(rows);
    return { synced, skipped };
  }

  async syncGameSchedule(
    season: string,
    week: number,
    seasonType: string,
  ): Promise<GameData[]> {
    return this.statsProvider.fetchGameSchedule(season, week, seasonType);
  }

  async getNflState(): Promise<{ season: string; week: number; seasonType: string }> {
    const state = await this.statsProvider.fetchNflState();
    return { season: state.season, week: state.week, seasonType: state.seasonType };
  }

  // --- Read operations (API endpoints) ---

  async getLeaguePlayerScores(
    leagueId: string,
    week: number,
    userId: string,
  ): Promise<
    Array<{ player_id: string; stats: Record<string, number>; fantasy_points: number }>
  > {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const rosters = await this.leagueRepository.findRostersByLeagueId(leagueId);
    const allPlayerIds = rosters.flatMap((r) => r.players);
    if (allPlayerIds.length === 0) return [];

    const stats = await this.scoringRepository.findStatsByPlayerIds(
      allPlayerIds,
      league.season,
      week,
      league.seasonType,
    );

    return stats.map((stat) => ({
      player_id: stat.playerId,
      stats: stat.stats,
      fantasy_points: calculateFantasyPoints(stat.stats, league.scoringSettings),
    }));
  }

  async getLeaguePlayerProjections(
    leagueId: string,
    week: number,
    userId: string,
  ): Promise<
    Array<{
      player_id: string;
      projections: Record<string, number>;
      projected_points: number;
    }>
  > {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const rosters = await this.leagueRepository.findRostersByLeagueId(leagueId);
    const allPlayerIds = rosters.flatMap((r) => r.players);
    if (allPlayerIds.length === 0) return [];

    const projections = await this.scoringRepository.findProjectionsByPlayerIds(
      allPlayerIds,
      league.season,
      week,
      league.seasonType,
    );

    return projections.map((proj) => ({
      player_id: proj.playerId,
      projections: proj.projections,
      projected_points: calculateFantasyPoints(proj.projections, league.scoringSettings),
    }));
  }

  async getGameSchedule(
    season: string,
    week: number,
    seasonType: string,
  ): Promise<GameData[]> {
    return this.statsProvider.fetchGameSchedule(season, week, seasonType);
  }

  /**
   * Live scores: combines actual stats, pre-game projections, and live game status
   * to produce a real-time total for each rostered player.
   *
   * - pre_game: projected_points
   * - in_game: actual_points + remaining_projected_points
   * - complete: actual_points
   */
  async getLiveScores(
    leagueId: string,
    week: number,
    userId: string,
  ): Promise<{
    players: Array<{
      player_id: string;
      roster_id: number;
      full_name: string;
      position: string | null;
      team: string | null;
      game_status: GameStatus;
      actual_points: number;
      projected_points: number;
      live_total: number;
    }>;
    rosters: Array<{
      roster_id: number;
      owner_id: string | null;
      live_total: number;
      actual_total: number;
      projected_total: number;
    }>;
  }> {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const rosters = await this.leagueRepository.findRostersByLeagueId(leagueId);
    const allPlayerIds = rosters.flatMap((r) => r.players);
    if (allPlayerIds.length === 0) {
      return {
        players: [],
        rosters: rosters.map((r) => ({
          roster_id: r.rosterId,
          owner_id: r.ownerId,
          live_total: 0,
          actual_total: 0,
          projected_total: 0,
        })),
      };
    }

    // Fetch all data in parallel
    const [players, stats, projections, games] = await Promise.all([
      this.playerRepository.findByIds(allPlayerIds),
      this.scoringRepository.findStatsByPlayerIds(
        allPlayerIds,
        league.season,
        week,
        league.seasonType,
      ),
      this.scoringRepository.findProjectionsByPlayerIds(
        allPlayerIds,
        league.season,
        week,
        league.seasonType,
      ),
      this.statsProvider
        .fetchGameSchedule(league.season, week, league.seasonType)
        .catch(() => []),
    ]);

    // Build lookup maps
    const playerMap = new Map(players.map((p) => [p.id, p]));
    const statsMap = new Map(stats.map((s) => [s.playerId, s.stats]));
    const projMap = new Map(projections.map((p) => [p.playerId, p.projections]));

    // Build team → game status map from game schedule
    // game_id format varies, but metadata typically has team info
    const teamGameStatus = new Map<string, GameStatus>();
    for (const game of games) {
      const status = this.normalizeGameStatus(game.status);
      // Extract teams from metadata (Sleeper typically provides home/away)
      const meta = game.metadata || {};
      if (meta.home_team) teamGameStatus.set(meta.home_team, status);
      if (meta.away_team) teamGameStatus.set(meta.away_team, status);
      // Also try parsing game_id (often formatted as "away_home" e.g. "BUF_KC")
      if (game.gameId && !meta.home_team) {
        const parts = game.gameId.split('_');
        if (parts.length >= 2) {
          for (const part of parts) {
            // Only set if it looks like a team abbreviation (2-3 uppercase letters)
            if (/^[A-Z]{2,3}$/.test(part)) {
              teamGameStatus.set(part, status);
            }
          }
        }
      }
    }

    // Build player → roster_id map
    const playerRosterMap = new Map<string, number>();
    for (const roster of rosters) {
      for (const pid of roster.players) {
        playerRosterMap.set(pid, roster.rosterId);
      }
    }

    // Calculate live scores per player
    const playerResults: Array<{
      player_id: string;
      roster_id: number;
      full_name: string;
      position: string | null;
      team: string | null;
      game_status: GameStatus;
      actual_points: number;
      projected_points: number;
      live_total: number;
    }> = [];

    for (const playerId of allPlayerIds) {
      const player = playerMap.get(playerId);
      if (!player) continue;

      const actual = statsMap.get(playerId) || {};
      const projected = projMap.get(playerId) || {};
      const gameStatus = player.team
        ? teamGameStatus.get(player.team) || 'pre_game'
        : 'pre_game';

      const { actual_points, projected_points, live_total } = calculateLivePoints(
        actual,
        projected,
        gameStatus,
        league.scoringSettings,
      );

      playerResults.push({
        player_id: playerId,
        roster_id: playerRosterMap.get(playerId) || 0,
        full_name: player.fullName,
        position: player.position,
        team: player.team,
        game_status: gameStatus,
        actual_points,
        projected_points,
        live_total,
      });
    }

    // Aggregate per roster
    const rosterTotals = new Map<
      number,
      { actual: number; projected: number; live: number }
    >();
    for (const roster of rosters) {
      rosterTotals.set(roster.rosterId, { actual: 0, projected: 0, live: 0 });
    }
    for (const p of playerResults) {
      const totals = rosterTotals.get(p.roster_id);
      if (totals) {
        totals.actual += p.actual_points;
        totals.projected += p.projected_points;
        totals.live += p.live_total;
      }
    }

    const rosterResults = rosters.map((r) => {
      const totals = rosterTotals.get(r.rosterId) || {
        actual: 0,
        projected: 0,
        live: 0,
      };
      return {
        roster_id: r.rosterId,
        owner_id: r.ownerId,
        live_total: Math.round(totals.live * 100) / 100,
        actual_total: Math.round(totals.actual * 100) / 100,
        projected_total: Math.round(totals.projected * 100) / 100,
      };
    });

    return { players: playerResults, rosters: rosterResults };
  }

  private normalizeGameStatus(status: string): GameStatus {
    switch (status) {
      case 'complete':
      case 'post_game':
        return 'complete';
      case 'in_game':
      case 'in_progress':
        return 'in_game';
      default:
        return 'pre_game';
    }
  }
}
