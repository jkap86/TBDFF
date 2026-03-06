import { Pool } from 'pg';
import { config } from './config';

// Infrastructure
import { SleeperApiClient } from './integrations/sleeper/sleeper-api-client';
import { SleeperPlayerProvider } from './integrations/sleeper/sleeper-player-provider';
import { SleeperStatsProvider } from './integrations/sleeper/sleeper-stats-provider';
import { EmailService } from './shared/email';

// Shared repositories (cross-cutting, used by 4+ modules)
import { LeagueRepository } from './modules/leagues/leagues.repository';
import { PlayerRepository } from './modules/players/players.repository';
import { DraftRepository } from './modules/drafts/drafts.repository';

// Domain modules
import { registerAuthModule } from './modules/auth/auth.module';
import { registerPlayersModule } from './modules/players/players.module';
import { registerChatModule } from './modules/chat/chat.module';
import { registerLeaguesModule } from './modules/leagues/leagues.module';
import { registerDraftsModule } from './modules/drafts/drafts.module';
import { registerScoringModule } from './modules/scoring/scoring.module';
import { registerMatchupsModule } from './modules/matchups/matchups.module';
import { registerTradesModule } from './modules/trades/trades.module';
import { registerTransactionsModule } from './modules/transactions/transactions.module';
import { registerPaymentsModule } from './modules/payments/payments.module';
import { registerJobs } from './jobs/jobs.module';

function createPool(): Pool {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 20,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ...(config.DATABASE_SSL && { ssl: { rejectUnauthorized: false } }),
  });

  pool.on('error', (err) => {
    console.error('Unexpected database error', err.message);
  });

  return pool;
}

export function createContainer() {
  // ── Infrastructure ──────────────────────────────────────────────
  const pool = createPool();

  const sleeperApi = new SleeperApiClient();
  const sleeperPlayerProvider = new SleeperPlayerProvider(sleeperApi);
  const sleeperStatsProvider = new SleeperStatsProvider(sleeperApi);
  const emailService = new EmailService();

  // ── Shared repositories (used across 4+ modules) ───────────────
  const leagueRepository = new LeagueRepository(pool);
  const playerRepository = new PlayerRepository(pool);
  const draftRepository = new DraftRepository(pool);

  // ── Tier 1: No cross-module dependencies ───────────────────────
  const auth = registerAuthModule({ pool, emailService });
  const players = registerPlayersModule({ playerRepository, playerDataProvider: sleeperPlayerProvider });
  const chat = registerChatModule({ pool });

  // ── Tier 2: Depends on shared repos + Tier 1 ──────────────────
  const leagues = registerLeaguesModule({
    leagueRepository,
    draftRepository,
    systemMessageService: chat.systemMessageService,
  });

  const drafts = registerDraftsModule({ pool, draftRepository, leagueRepository, playerRepository });

  const scoring = registerScoringModule({
    pool,
    playerRepository,
    leagueRepository,
    statsDataProvider: sleeperStatsProvider,
  });

  // ── Tier 3: Depends on shared repos ────────────────────────────
  const matchups = registerMatchupsModule({ pool, leagueRepository, draftRepository });
  const trades = registerTradesModule({ pool, leagueRepository, draftRepository, playerRepository });
  const transactions = registerTransactionsModule({ pool, leagueRepository, playerRepository });
  const payments = registerPaymentsModule({ pool, leagueRepository, systemMessageService: chat.systemMessageService });

  // ── Jobs ────────────────────────────────────────────────────────
  const jobs = registerJobs({
    pool,
    draftRepository,
    playerService: players.playerService,
    scoringService: scoring.scoringService,
    transactionService: transactions.transactionService,
    tradeService: trades.tradeService,
    slowAuctionService: drafts.slowAuctionService,
    auctionService: drafts.auctionService,
  });

  // ── Return (same shape as original) ─────────────────────────────
  return {
    pool,
    repositories: {
      draftRepository,
      leagueRepository,
    },
    services: {
      chatService: chat.chatService,
      systemMessageService: chat.systemMessageService,
      draftService: drafts.draftService,
      auctionService: drafts.auctionService,
      slowAuctionService: drafts.slowAuctionService,
      derbyService: drafts.derbyService,
      matchupDerbyService: matchups.matchupDerbyService,
      tradeService: trades.tradeService,
      transactionService: transactions.transactionService,
    },
    controllers: {
      authController: auth.authController,
      leagueController: leagues.leagueController,
      playerController: players.playerController,
      scoringController: scoring.scoringController,
      draftController: drafts.draftController,
      matchupController: matchups.matchupController,
      chatController: chat.chatController,
      tradeController: trades.tradeController,
      transactionController: transactions.transactionController,
      paymentController: payments.paymentController,
    },
    jobs,
  };
}

export type Container = ReturnType<typeof createContainer>;
