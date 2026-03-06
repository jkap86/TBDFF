import { LeagueRepository } from './leagues.repository';
import { LeagueService } from './leagues.service';
import { LeagueInviteService } from './league-invite.service';
import { LeagueRosterService } from './league-roster.service';
import { LeagueController } from './leagues.controller';
import { DraftRepository } from '../drafts/drafts.repository';
import { SystemMessageService } from '../chat/system-message.service';

interface LeaguesModuleDeps {
  leagueRepository: LeagueRepository;
  draftRepository: DraftRepository;
  systemMessageService: SystemMessageService;
}

export function registerLeaguesModule(deps: LeaguesModuleDeps) {
  const leagueService = new LeagueService(
    deps.leagueRepository,
    deps.draftRepository,
    deps.systemMessageService,
  );
  const leagueInviteService = new LeagueInviteService(
    deps.leagueRepository,
    deps.systemMessageService,
  );
  const leagueRosterService = new LeagueRosterService(
    deps.leagueRepository,
    deps.draftRepository,
    deps.systemMessageService,
  );
  const leagueController = new LeagueController(leagueService, leagueInviteService, leagueRosterService);

  return { leagueController };
}
