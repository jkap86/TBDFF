import { Pool } from 'pg';
import { TradeRepository } from './trades.repository';
import { TradeService } from './trades.service';
import { TradeController } from './trades.controller';
import { LeagueRepository } from '../leagues/leagues.repository';
import { DraftRepository } from '../drafts/drafts.repository';
import { PlayerRepository } from '../players/players.repository';

interface TradesModuleDeps {
  pool: Pool;
  leagueRepository: LeagueRepository;
  draftRepository: DraftRepository;
  playerRepository: PlayerRepository;
}

export function registerTradesModule(deps: TradesModuleDeps) {
  const tradeRepository = new TradeRepository(deps.pool);
  const tradeService = new TradeService(
    tradeRepository,
    deps.leagueRepository,
    deps.draftRepository,
    deps.playerRepository,
  );
  const tradeController = new TradeController(tradeService);

  return { tradeService, tradeController };
}
