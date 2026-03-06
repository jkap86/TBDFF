import { Pool } from 'pg';
import { ScoringRepository } from './scoring.repository';
import { ScoringService } from './scoring.service';
import { ScoringController } from './scoring.controller';
import { PlayerRepository } from '../players/players.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { LeagueMembersRepository } from '../leagues/league-members.repository';
import { LeagueRostersRepository } from '../leagues/league-rosters.repository';
import { StatsDataProvider } from '../../integrations/shared/stats-data-provider.interface';

interface ScoringModuleDeps {
  pool: Pool;
  playerRepository: PlayerRepository;
  leagueRepository: LeagueRepository;
  leagueMembersRepository: LeagueMembersRepository;
  leagueRostersRepository: LeagueRostersRepository;
  statsDataProvider: StatsDataProvider;
}

export function registerScoringModule(deps: ScoringModuleDeps) {
  const scoringRepository = new ScoringRepository(deps.pool);
  const scoringService = new ScoringService(
    scoringRepository,
    deps.playerRepository,
    deps.leagueRepository,
    deps.leagueMembersRepository,
    deps.leagueRostersRepository,
    deps.statsDataProvider,
  );
  const scoringController = new ScoringController(scoringService);

  return { scoringService, scoringController };
}
