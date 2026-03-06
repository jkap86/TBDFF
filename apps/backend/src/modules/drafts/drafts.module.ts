import { Pool } from 'pg';
import { DraftRepository } from './drafts.repository';
import { DraftPicksRepository } from './draft-picks.repository';
import { DraftTimerRepository } from './draft-timer.repository';
import { DraftQueueRepository } from './draft-queue.repository';
import { AuctionLotRepository } from './auction-lot.repository';
import { DraftService } from './drafts.service';
import { DraftQueueService } from './draft-queue.service';
import { DraftClockService } from './draft-clock.service';
import { AutoPickService } from './auto-pick.service';
import { AuctionAutoBidService } from './auction-auto-bid.service';
import { AuctionService } from './auction.service';
import { SlowAuctionService } from './slow-auction.service';
import { DerbyService } from './derby.service';
import { DraftController } from './drafts.controller';
import { LeagueRepository } from '../leagues/leagues.repository';
import { LeagueMembersRepository } from '../leagues/league-members.repository';
import { LeagueRostersRepository } from '../leagues/league-rosters.repository';
import { PlayerRepository } from '../players/players.repository';

interface DraftsModuleDeps {
  pool: Pool;
  draftRepository: DraftRepository;
  draftPicksRepository: DraftPicksRepository;
  draftTimerRepository: DraftTimerRepository;
  draftQueueRepository: DraftQueueRepository;
  leagueRepository: LeagueRepository;
  leagueMembersRepository: LeagueMembersRepository;
  leagueRostersRepository: LeagueRostersRepository;
  playerRepository: PlayerRepository;
}

export function registerDraftsModule(deps: DraftsModuleDeps) {
  const auctionLotRepository = new AuctionLotRepository(deps.pool);

  const draftQueueService = new DraftQueueService(deps.draftRepository, deps.draftQueueRepository, deps.draftPicksRepository, deps.leagueRepository, deps.leagueMembersRepository);
  const draftClockService = new DraftClockService(deps.draftRepository, deps.draftTimerRepository, deps.leagueRepository, deps.leagueMembersRepository);
  const autoPickService = new AutoPickService(deps.draftRepository, deps.draftTimerRepository, deps.draftQueueRepository, deps.draftPicksRepository, deps.leagueRepository, deps.leagueMembersRepository, deps.pool);
  const draftService = new DraftService(deps.draftRepository, deps.draftPicksRepository, deps.leagueRepository, deps.leagueMembersRepository, deps.leagueRostersRepository, deps.playerRepository, autoPickService);
  const auctionAutoBidService = new AuctionAutoBidService(deps.draftRepository, deps.draftTimerRepository, deps.draftQueueRepository, deps.draftPicksRepository, deps.leagueRepository, deps.playerRepository);
  const auctionService = new AuctionService(deps.draftRepository, deps.draftQueueRepository, deps.draftPicksRepository, deps.leagueRepository, deps.leagueMembersRepository, deps.playerRepository, auctionAutoBidService);
  auctionAutoBidService.setOnDeadlineExpired((draftId, userId) => auctionService.resolveNomination(draftId, userId));
  const slowAuctionService = new SlowAuctionService(
    auctionLotRepository,
    deps.draftRepository,
    deps.draftQueueRepository,
    deps.draftPicksRepository,
    deps.leagueRepository,
    deps.leagueMembersRepository,
    deps.playerRepository,
    deps.pool,
  );
  const derbyService = new DerbyService(deps.draftRepository, deps.leagueRepository, deps.leagueMembersRepository, deps.leagueRostersRepository);
  const draftController = new DraftController(draftService, draftQueueService, draftClockService, autoPickService, auctionAutoBidService, auctionService, slowAuctionService, derbyService);

  return { draftService, draftQueueService, draftClockService, autoPickService, auctionAutoBidService, auctionService, slowAuctionService, derbyService, draftController };
}
