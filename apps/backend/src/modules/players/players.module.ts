import { PlayerRepository } from './players.repository';
import { PlayerService } from './players.service';
import { PlayerController } from './players.controller';
import { PlayerDataProvider } from '../../integrations/shared/player-data-provider.interface';

interface PlayersModuleDeps {
  playerRepository: PlayerRepository;
  playerDataProvider: PlayerDataProvider;
}

export function registerPlayersModule(deps: PlayersModuleDeps) {
  const playerService = new PlayerService(deps.playerRepository, deps.playerDataProvider);
  const playerController = new PlayerController(playerService);

  return { playerService, playerController };
}
