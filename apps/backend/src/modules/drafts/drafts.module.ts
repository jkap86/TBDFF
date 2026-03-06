import { Pool } from 'pg';
import { DraftRepository } from './drafts.repository';
import { AuctionLotRepository } from './auction-lot.repository';
import { DraftService } from './drafts.service';
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

  const draftService = new DraftService(deps.draftRepository, deps.leagueRepository, deps.playerRepository);
  const auctionService = new AuctionService(deps.draftRepository, deps.leagueRepository, deps.playerRepository);
  const slowAuctionService = new SlowAuctionService(
    auctionLotRepository,
    deps.draftRepository,
    deps.leagueRepository,
    deps.playerRepository,
    deps.pool,
  );
  const derbyService = new DerbyService(deps.draftRepository, deps.leagueRepository);
  const draftController = new DraftController(draftService, auctionService, slowAuctionService, derbyService);

  return { draftService, auctionService, slowAuctionService, derbyService, draftController };
}
