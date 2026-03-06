import { Pool } from 'pg';
import { MatchupRepository } from './matchups.repository';
import { MatchupDerbyRepository } from './matchup-derby.repository';
import { MatchupService } from './matchups.service';
import { MatchupDerbyService } from './matchup-derby.service';
import { MatchupController } from './matchups.controller';
import { LeagueRepository } from '../leagues/leagues.repository';
import { LeagueMembersRepository } from '../leagues/league-members.repository';
import { LeagueRostersRepository } from '../leagues/league-rosters.repository';
import { DraftRepository } from '../drafts/drafts.repository';

interface MatchupsModuleDeps {
  pool: Pool;
  leagueRepository: LeagueRepository;
  leagueMembersRepository: LeagueMembersRepository;
  leagueRostersRepository: LeagueRostersRepository;
  draftRepository: DraftRepository;
}

export function registerMatchupsModule(deps: MatchupsModuleDeps) {
  const matchupRepository = new MatchupRepository(deps.pool);
  const matchupDerbyRepository = new MatchupDerbyRepository(deps.pool);

  const matchupService = new MatchupService(
    matchupRepository,
    deps.leagueRepository,
    deps.leagueMembersRepository,
    deps.leagueRostersRepository,
    deps.draftRepository,
  );
  const matchupDerbyService = new MatchupDerbyService(
    matchupDerbyRepository,
    matchupRepository,
    deps.leagueRepository,
    deps.leagueMembersRepository,
    deps.leagueRostersRepository,
    deps.draftRepository,
  );
  const matchupController = new MatchupController(matchupService, matchupDerbyService);

  return { matchupDerbyService, matchupController };
}
