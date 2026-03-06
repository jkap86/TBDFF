import { Pool } from 'pg';
import { TransactionRepository } from './transactions.repository';
import { TransactionService } from './transactions.service';
import { TransactionController } from './transactions.controller';
import { LeagueRepository } from '../leagues/leagues.repository';
import { LeagueMembersRepository } from '../leagues/league-members.repository';
import { LeagueRostersRepository } from '../leagues/league-rosters.repository';
import { PlayerRepository } from '../players/players.repository';

interface TransactionsModuleDeps {
  pool: Pool;
  leagueRepository: LeagueRepository;
  leagueMembersRepository: LeagueMembersRepository;
  leagueRostersRepository: LeagueRostersRepository;
  playerRepository: PlayerRepository;
}

export function registerTransactionsModule(deps: TransactionsModuleDeps) {
  const transactionRepository = new TransactionRepository(deps.pool);
  const transactionService = new TransactionService(
    transactionRepository,
    deps.leagueRepository,
    deps.leagueMembersRepository,
    deps.leagueRostersRepository,
    deps.playerRepository,
  );
  const transactionController = new TransactionController(transactionService);

  return { transactionService, transactionController };
}
