import { Pool } from 'pg';
import { DraftRepository } from './drafts.repository';
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
import { PlayerRepository } from '../players/players.repository';

interface DraftsModuleDeps {
  pool: Pool;
  draftRepository: DraftRepository;
  leagueRepository: LeagueRepository;
  playerRepository: PlayerRepository;
}

export function registerDraftsModule(deps: DraftsModuleDeps) {
  const auctionLotRepository = new AuctionLotRepository(deps.pool);

  const draftQueueService = new DraftQueueService(deps.draftRepository, deps.leagueRepository);
  const draftClockService = new DraftClockService(deps.draftRepository, deps.leagueRepository);
  const autoPickService = new AutoPickService(deps.draftRepository, deps.leagueRepository);
  const draftService = new DraftService(deps.draftRepository, deps.leagueRepository, deps.playerRepository, autoPickService);
  const auctionAutoBidService = new AuctionAutoBidService(deps.draftRepository, deps.leagueRepository, deps.playerRepository);
  const auctionService = new AuctionService(deps.draftRepository, deps.leagueRepository, deps.playerRepository, auctionAutoBidService);
  auctionAutoBidService.setOnDeadlineExpired((draftId, userId) => auctionService.resolveNomination(draftId, userId));
  const slowAuctionService = new SlowAuctionService(
    auctionLotRepository,
    deps.draftRepository,
    deps.leagueRepository,
    deps.playerRepository,
    deps.pool,
  );
  const derbyService = new DerbyService(deps.draftRepository, deps.leagueRepository);
  const draftController = new DraftController(draftService, draftQueueService, draftClockService, autoPickService, auctionAutoBidService, auctionService, slowAuctionService, derbyService);

  return { draftService, draftQueueService, draftClockService, autoPickService, auctionAutoBidService, auctionService, slowAuctionService, derbyService, draftController };
}
