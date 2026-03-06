import { LeagueRepository } from './leagues.repository';
import { LeagueService } from './leagues.service';
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
  const leagueController = new LeagueController(leagueService);

  return { leagueController };
}
