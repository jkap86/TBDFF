// Sleeper API response types (provider-specific)
interface SleeperPlayer {
  player_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  position: string;
  fantasy_positions: string[];
  team: string | null;
  active: boolean;
  injury_status: string | null;
  years_exp: number | null;
  age: number | null;
  number: number | null;
  search_rank: number | null;
}

export interface SleeperNflState {
  season: string;
  display_week: number;
  season_type: string;
  week: number;
  leg: number;
  season_start_date: string;
  previous_season: string;
}

export interface SleeperGameScore {
  game_id: string;
  metadata: Record<string, any>;
  status: string;
  start_time: string;
}

export class SleeperApiClient {
  private readonly baseUrl = 'https://api.sleeper.app/v1';

  async fetchNflPlayers(): Promise<Record<string, SleeperPlayer>> {
    const response = await fetch(`${this.baseUrl}/players/nfl`);
    if (!response.ok) {
      throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<Record<string, SleeperPlayer>>;
  }

  async fetchNflState(): Promise<SleeperNflState> {
    const response = await fetch(`${this.baseUrl}/state/nfl`);
    if (!response.ok) {
      throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<SleeperNflState>;
  }

  async fetchWeeklyStats(
    season: string,
    week: number,
    seasonType: string = 'regular',
  ): Promise<Record<string, Record<string, number>>> {
    const response = await fetch(
      `https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=${seasonType}`,
    );
    if (!response.ok) {
      throw new Error(`Sleeper stats API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<Record<string, Record<string, number>>>;
  }

  async fetchWeeklyProjections(
    season: string,
    week: number,
    seasonType: string = 'regular',
  ): Promise<Record<string, Record<string, number>>> {
    const response = await fetch(
      `https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=${seasonType}`,
    );
    if (!response.ok) {
      throw new Error(`Sleeper projections API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<Record<string, Record<string, number>>>;
  }

  async fetchGameSchedule(
    season: string,
    week: number,
    seasonType: string = 'regular',
  ): Promise<SleeperGameScore[]> {
    const query = `query batch_scores {
      scores(sport: "nfl", season_type: "${seasonType}", season: "${season}", week: ${week}) {
        game_id
        metadata
        status
        start_time
      }
    }`;

    const response = await fetch('https://sleeper.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      throw new Error(`Sleeper GraphQL error: ${response.status} ${response.statusText}`);
    }
    const result = (await response.json()) as { data: { scores: SleeperGameScore[] } };
    return result.data.scores;
  }
}
