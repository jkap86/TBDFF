import { PlayerDataProvider, PlayerData } from '../shared/player-data-provider.interface';
import { SleeperApiClient } from './sleeper-api-client';

export class SleeperPlayerProvider implements PlayerDataProvider {
  readonly providerName = 'sleeper';

  constructor(private readonly sleeperApi: SleeperApiClient) {}

  async fetchAllPlayers(): Promise<PlayerData[]> {
    const sleeperPlayersMap = await this.sleeperApi.fetchNflPlayers();

    // Map Sleeper-specific format to provider-agnostic PlayerData
    return Object.entries(sleeperPlayersMap).map(([id, sp]) => ({
      externalId: id,
      firstName: sp.first_name || null,
      lastName: sp.last_name || null,
      fullName: sp.full_name,
      position: sp.position || null,
      fantasyPositions: sp.fantasy_positions || [],
      team: sp.team || null,
      active: sp.active ?? true,
      injuryStatus: sp.injury_status || null,
      yearsExp: sp.years_exp ?? null,
      age: sp.age ?? null,
      jerseyNumber: sp.number ?? null,
    }));
  }

  async fetchPlayer(externalId: string): Promise<PlayerData | null> {
    const allPlayers = await this.sleeperApi.fetchNflPlayers();
    const sleeperPlayer = allPlayers[externalId];
    if (!sleeperPlayer) return null;

    return {
      externalId,
      firstName: sleeperPlayer.first_name || null,
      lastName: sleeperPlayer.last_name || null,
      fullName: sleeperPlayer.full_name,
      position: sleeperPlayer.position || null,
      fantasyPositions: sleeperPlayer.fantasy_positions || [],
      team: sleeperPlayer.team || null,
      active: sleeperPlayer.active ?? true,
      injuryStatus: sleeperPlayer.injury_status || null,
      yearsExp: sleeperPlayer.years_exp ?? null,
      age: sleeperPlayer.age ?? null,
      jerseyNumber: sleeperPlayer.number ?? null,
    };
  }
}
