import { Pool } from 'pg';
import { PlayerSyncJob } from './player-sync.job';
import { StatsSyncJob } from './stats-sync.job';
import { WaiverProcessJob } from './waiver-process.job';
import { TradeReviewJob } from './trade-review.job';
import { SlowAuctionSettlementJob } from './slow-auction-settlement.job';
import { AuctionTimerJob } from './auction-timer.job';
import { AutoPickJob } from './auto-pick.job';
import { PlayerService } from '../modules/players/players.service';
import { ScoringService } from '../modules/scoring/scoring.service';
import { TransactionService } from '../modules/transactions/transactions.service';
import { TradeService } from '../modules/trades/trades.service';
import { SlowAuctionService } from '../modules/drafts/slow-auction.service';
import { AuctionAutoBidService } from '../modules/drafts/auction-auto-bid.service';
import { AutoPickService } from '../modules/drafts/auto-pick.service';
import { DraftRepository } from '../modules/drafts/drafts.repository';
import { DraftTimerRepository } from '../modules/drafts/draft-timer.repository';
import { DraftPicksRepository } from '../modules/drafts/draft-picks.repository';

interface JobsDeps {
  pool: Pool;
  draftRepository: DraftRepository;
  draftPicksRepository: DraftPicksRepository;
  draftTimerRepository: DraftTimerRepository;
  playerService: PlayerService;
  scoringService: ScoringService;
  transactionService: TransactionService;
  tradeService: TradeService;
  slowAuctionService: SlowAuctionService;
  auctionAutoBidService: AuctionAutoBidService;
  autoPickService: AutoPickService;
}

export function registerJobs(deps: JobsDeps) {
  const playerSyncJob = new PlayerSyncJob(deps.playerService);
  const statsSyncJob = new StatsSyncJob(deps.scoringService);
  const waiverProcessJob = new WaiverProcessJob(deps.transactionService);
  const tradeReviewJob = new TradeReviewJob(deps.tradeService);
  const slowAuctionSettlementJob = new SlowAuctionSettlementJob(deps.slowAuctionService, deps.pool);
  const auctionTimerJob = new AuctionTimerJob(deps.auctionAutoBidService, deps.draftTimerRepository, deps.draftRepository);
  const autoPickJob = new AutoPickJob(deps.autoPickService, deps.draftTimerRepository, deps.draftRepository, deps.draftPicksRepository);

  return {
    playerSyncJob,
    statsSyncJob,
    waiverProcessJob,
    tradeReviewJob,
    slowAuctionSettlementJob,
    auctionTimerJob,
    autoPickJob,
  };
}
