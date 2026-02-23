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

export class SleeperApiClient {
  private readonly baseUrl = 'https://api.sleeper.app/v1';

  async fetchNflPlayers(): Promise<Record<string, SleeperPlayer>> {
    const response = await fetch(`${this.baseUrl}/players/nfl`);
    if (!response.ok) {
      throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<Record<string, SleeperPlayer>>;
  }
}
