import { Pool } from 'pg';
import { TradeRepository } from './trades.repository';
import { TradeService } from './trades.service';
import { TradeController } from './trades.controller';
import { LeagueRepository } from '../leagues/leagues.repository';
import { LeagueMembersRepository } from '../leagues/league-members.repository';
import { LeagueRostersRepository } from '../leagues/league-rosters.repository';
import { DraftRepository } from '../drafts/drafts.repository';
import { PlayerRepository } from '../players/players.repository';

interface TradesModuleDeps {
  pool: Pool;
  leagueRepository: LeagueRepository;
  leagueMembersRepository: LeagueMembersRepository;
  leagueRostersRepository: LeagueRostersRepository;
  draftRepository: DraftRepository;
  playerRepository: PlayerRepository;
}

export function registerTradesModule(deps: TradesModuleDeps) {
  const tradeRepository = new TradeRepository(deps.pool);
  const tradeService = new TradeService(
    tradeRepository,
    deps.leagueRepository,
    deps.leagueMembersRepository,
    deps.leagueRostersRepository,
    deps.draftRepository,
    deps.playerRepository,
  );
  const tradeController = new TradeController(tradeService);

  return { tradeService, tradeController };
}
