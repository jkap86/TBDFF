import { PlayerRepository } from './players.repository';
import { PlayerDataProvider } from '../../integrations/shared/player-data-provider.interface';
import { Player } from './players.model';
import { NotFoundException, ValidationException } from '../../shared/exceptions';

export class PlayerService {
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly playerProvider: PlayerDataProvider  // Interface, not concrete type!
  ) {}

  // Read operations (public API)
  async getAllPlayers(limit: number = 1000, offset: number = 0): Promise<Player[]> {
    return this.playerRepository.findAll(limit, offset);
  }

  async getPlayerById(id: string): Promise<Player> {
    const player = await this.playerRepository.findById(id);
    if (!player) throw new NotFoundException('Player not found');
    return player;
  }

  async searchPlayers(query: string, limit: number = 50): Promise<Player[]> {
    if (!query || query.trim().length < 2) {
      throw new ValidationException('Search query must be at least 2 characters');
    }
    return this.playerRepository.search(query.trim(), limit);
  }

  async getPlayersByIds(ids: string[]): Promise<Player[]> {
    if (ids.length === 0) return [];
    return this.playerRepository.findByIds(ids.slice(0, 500));
  }

  async getPlayersByPosition(position: string): Promise<Player[]> {
    return this.playerRepository.findByPosition(position);
  }

  async getPlayersByTeam(team: string): Promise<Player[]> {
    return this.playerRepository.findByTeam(team);
  }

  // Sync operations (internal - called by job)
  async syncPlayersFromProvider(): Promise<{ created: number; updated: number }> {
    const providerPlayers = await this.playerProvider.fetchAllPlayers();
    let created = 0;
    let updated = 0;

    for (const playerData of providerPlayers) {
      // Check if player exists via external ID
      const existing = await this.playerRepository.findByExternalId(
        this.playerProvider.providerName,
        playerData.externalId
      );

      const player = await this.playerRepository.upsertPlayer({
        id: existing?.id,
        firstName: playerData.firstName,
        lastName: playerData.lastName,
        fullName: playerData.fullName,
        position: playerData.position,
        fantasyPositions: playerData.fantasyPositions,
        team: playerData.team,
        active: playerData.active,
        injuryStatus: playerData.injuryStatus,
        yearsExp: playerData.yearsExp,
        age: playerData.age,
        jerseyNumber: playerData.jerseyNumber,
        searchRank: playerData.searchRank,
      });

      // Link external ID
      await this.playerRepository.linkExternalId(
        player.id,
        this.playerProvider.providerName,
        playerData.externalId
      );

      if (existing) {
        updated++;
      } else {
        created++;
      }
    }

    // Recompute auction values from search_rank after all players synced
    await this.playerRepository.computeAuctionValues();

    return { created, updated };
  }
}
