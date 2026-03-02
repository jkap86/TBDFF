import { Pool } from 'pg';
import { config } from './config';

// Integrations
import { SleeperApiClient } from './integrations/sleeper/sleeper-api-client';
import { SleeperPlayerProvider } from './integrations/sleeper/sleeper-player-provider';
import { SleeperStatsProvider } from './integrations/sleeper/sleeper-stats-provider';

// Repositories
import { UserRepository } from './modules/auth/auth.repository';
import { LeagueRepository } from './modules/leagues/leagues.repository';
import { PlayerRepository } from './modules/players/players.repository';
import { ScoringRepository } from './modules/scoring/scoring.repository';
import { DraftRepository } from './modules/drafts/drafts.repository';
import { AuctionLotRepository } from './modules/drafts/auction-lot.repository';
import { MatchupRepository } from './modules/matchups/matchups.repository';
import { MatchupDerbyRepository } from './modules/matchups/matchup-derby.repository';
import { ChatRepository } from './modules/chat/chat.repository';
import { TradeRepository } from './modules/trades/trades.repository';
import { TransactionRepository } from './modules/transactions/transactions.repository';
import { PaymentRepository } from './modules/payments/payments.repository';

// Shared
import { EmailService } from './shared/email';

// Services
import { AuthService } from './modules/auth/auth.service';
import { LeagueService } from './modules/leagues/leagues.service';
import { PlayerService } from './modules/players/players.service';
import { ScoringService } from './modules/scoring/scoring.service';
import { DraftService } from './modules/drafts/drafts.service';
import { AuctionService } from './modules/drafts/auction.service';
import { SlowAuctionService } from './modules/drafts/slow-auction.service';
import { DerbyService } from './modules/drafts/derby.service';
import { MatchupService } from './modules/matchups/matchups.service';
import { MatchupDerbyService } from './modules/matchups/matchup-derby.service';
import { ChatService } from './modules/chat/chat.service';
import { TradeService } from './modules/trades/trades.service';
import { TransactionService } from './modules/transactions/transactions.service';
import { PaymentService } from './modules/payments/payments.service';

// Controllers
import { AuthController } from './modules/auth/auth.controller';
import { LeagueController } from './modules/leagues/leagues.controller';
import { PlayerController } from './modules/players/players.controller';
import { ScoringController } from './modules/scoring/scoring.controller';
import { DraftController } from './modules/drafts/drafts.controller';
import { MatchupController } from './modules/matchups/matchups.controller';
import { ChatController } from './modules/chat/chat.controller';
import { TradeController } from './modules/trades/trades.controller';
import { TransactionController } from './modules/transactions/transactions.controller';
import { PaymentController } from './modules/payments/payments.controller';

// Jobs
import { PlayerSyncJob } from './jobs/player-sync.job';
import { StatsSyncJob } from './jobs/stats-sync.job';
import { WaiverProcessJob } from './jobs/waiver-process.job';
import { TradeReviewJob } from './jobs/trade-review.job';
import { SlowAuctionSettlementJob } from './jobs/slow-auction-settlement.job';
import { AuctionTimerJob } from './jobs/auction-timer.job';

function createPool(): Pool {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 20,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected database error', err.message);
  });

  return pool;
}

export function createContainer() {
  const pool = createPool();

  // Integrations
  const sleeperApi = new SleeperApiClient();
  const sleeperPlayerProvider = new SleeperPlayerProvider(sleeperApi);
  const sleeperStatsProvider = new SleeperStatsProvider(sleeperApi);

  // Repositories
  const userRepository = new UserRepository(pool);
  const leagueRepository = new LeagueRepository(pool);
  const playerRepository = new PlayerRepository(pool);
  const scoringRepository = new ScoringRepository(pool);
  const draftRepository = new DraftRepository(pool);
  const auctionLotRepository = new AuctionLotRepository(pool);
  const matchupRepository = new MatchupRepository(pool);
  const matchupDerbyRepository = new MatchupDerbyRepository(pool);
  const chatRepository = new ChatRepository(pool);
  const tradeRepository = new TradeRepository(pool);
  const transactionRepository = new TransactionRepository(pool);
  const paymentRepository = new PaymentRepository(pool);

  // Shared
  const emailService = new EmailService();

  // Services
  const authService = new AuthService(userRepository, emailService);
  const leagueService = new LeagueService(leagueRepository, draftRepository);
  const playerService = new PlayerService(playerRepository, sleeperPlayerProvider);
  const scoringService = new ScoringService(
    scoringRepository,
    playerRepository,
    leagueRepository,
    sleeperStatsProvider,
  );
  const draftService = new DraftService(draftRepository, leagueRepository, playerRepository);
  const auctionService = new AuctionService(draftRepository, leagueRepository, playerRepository);
  const slowAuctionService = new SlowAuctionService(auctionLotRepository, draftRepository, leagueRepository, playerRepository, pool);
  const derbyService = new DerbyService(draftRepository, leagueRepository);
  const matchupService = new MatchupService(matchupRepository, leagueRepository);
  const matchupDerbyService = new MatchupDerbyService(matchupDerbyRepository, matchupRepository, leagueRepository);
  const chatService = new ChatService(chatRepository);
  const tradeService = new TradeService(tradeRepository, leagueRepository, draftRepository);
  const transactionService = new TransactionService(transactionRepository, leagueRepository, playerRepository);
  const paymentService = new PaymentService(paymentRepository, leagueRepository);

  // Controllers
  const authController = new AuthController(authService);
  const leagueController = new LeagueController(leagueService);
  const playerController = new PlayerController(playerService);
  const scoringController = new ScoringController(scoringService);
  const draftController = new DraftController(draftService, auctionService, slowAuctionService, derbyService);
  const matchupController = new MatchupController(matchupService, matchupDerbyService);
  const chatController = new ChatController(chatService);
  const tradeController = new TradeController(tradeService);
  const transactionController = new TransactionController(transactionService);
  const paymentController = new PaymentController(paymentService);

  // Jobs
  const playerSyncJob = new PlayerSyncJob(playerService);
  const statsSyncJob = new StatsSyncJob(scoringService);
  const waiverProcessJob = new WaiverProcessJob(transactionService);
  const tradeReviewJob = new TradeReviewJob(tradeService);
  const slowAuctionSettlementJob = new SlowAuctionSettlementJob(slowAuctionService, pool);
  const auctionTimerJob = new AuctionTimerJob(auctionService, draftRepository);

  return {
    pool,
    repositories: {
      draftRepository,
      leagueRepository,
    },
    services: {
      chatService,
      draftService,
      auctionService,
      slowAuctionService,
      derbyService,
      matchupDerbyService,
      tradeService,
      transactionService,
    },
    controllers: {
      authController,
      leagueController,
      playerController,
      scoringController,
      draftController,
      matchupController,
      chatController,
      tradeController,
      transactionController,
      paymentController,
    },
    jobs: {
      playerSyncJob,
      statsSyncJob,
      waiverProcessJob,
      tradeReviewJob,
      slowAuctionSettlementJob,
      auctionTimerJob,
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
