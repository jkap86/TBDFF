import { LeagueRepository } from './leagues.repository';
import { LeagueMembersRepository } from './league-members.repository';
import { LeagueRostersRepository } from './league-rosters.repository';
import { LeagueService } from './leagues.service';
import { LeagueInviteService } from './league-invite.service';
import { LeagueRosterService } from './league-roster.service';
import { LeagueController } from './leagues.controller';
import { DraftRepository } from '../drafts/drafts.repository';
import { SystemMessageService } from '../chat/system-message.service';
import { PlayerRepository } from '../players/players.repository';

interface LeaguesModuleDeps {
  leagueRepository: LeagueRepository;
  leagueMembersRepository: LeagueMembersRepository;
  leagueRostersRepository: LeagueRostersRepository;
  draftRepository: DraftRepository;
  systemMessageService: SystemMessageService;
  playerRepository: PlayerRepository;
}

export function registerLeaguesModule(deps: LeaguesModuleDeps) {
  const leagueService = new LeagueService(
    deps.leagueRepository,
    deps.leagueMembersRepository,
    deps.leagueRostersRepository,
    deps.draftRepository,
    deps.systemMessageService,
  );
  const leagueInviteService = new LeagueInviteService(
    deps.leagueRepository,
    deps.leagueMembersRepository,
    deps.systemMessageService,
  );
  const leagueRosterService = new LeagueRosterService(
    deps.leagueRepository,
    deps.leagueMembersRepository,
    deps.leagueRostersRepository,
    deps.draftRepository,
    deps.systemMessageService,
    deps.playerRepository,
  );
  const leagueController = new LeagueController(leagueService, leagueInviteService, leagueRosterService);

  return { leagueController };
}
