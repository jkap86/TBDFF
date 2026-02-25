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
import { MatchupRepository } from './modules/matchups/matchups.repository';
import { ChatRepository } from './modules/chat/chat.repository';

// Services
import { AuthService } from './modules/auth/auth.service';
import { LeagueService } from './modules/leagues/leagues.service';
import { PlayerService } from './modules/players/players.service';
import { ScoringService } from './modules/scoring/scoring.service';
import { DraftService } from './modules/drafts/drafts.service';
import { MatchupService } from './modules/matchups/matchups.service';
import { ChatService } from './modules/chat/chat.service';

// Controllers
import { AuthController } from './modules/auth/auth.controller';
import { LeagueController } from './modules/leagues/leagues.controller';
import { PlayerController } from './modules/players/players.controller';
import { ScoringController } from './modules/scoring/scoring.controller';
import { DraftController } from './modules/drafts/drafts.controller';
import { MatchupController } from './modules/matchups/matchups.controller';
import { ChatController } from './modules/chat/chat.controller';

// Jobs
import { PlayerSyncJob } from './jobs/player-sync.job';
import { StatsSyncJob } from './jobs/stats-sync.job';

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
  const matchupRepository = new MatchupRepository(pool);
  const chatRepository = new ChatRepository(pool);

  // Services
  const authService = new AuthService(userRepository);
  const leagueService = new LeagueService(leagueRepository);
  const playerService = new PlayerService(playerRepository, sleeperPlayerProvider);
  const scoringService = new ScoringService(
    scoringRepository,
    playerRepository,
    leagueRepository,
    sleeperStatsProvider,
  );
  const draftService = new DraftService(draftRepository, leagueRepository, playerRepository);
  const matchupService = new MatchupService(matchupRepository, leagueRepository);
  const chatService = new ChatService(chatRepository);

  // Controllers
  const authController = new AuthController(authService);
  const leagueController = new LeagueController(leagueService);
  const playerController = new PlayerController(playerService);
  const scoringController = new ScoringController(scoringService);
  const draftController = new DraftController(draftService);
  const matchupController = new MatchupController(matchupService);
  const chatController = new ChatController(chatService);

  // Jobs
  const playerSyncJob = new PlayerSyncJob(playerService);
  const statsSyncJob = new StatsSyncJob(scoringService);

  return {
    pool,
    services: {
      chatService,
      draftService,
    },
    controllers: {
      authController,
      leagueController,
      playerController,
      scoringController,
      draftController,
      matchupController,
      chatController,
    },
    jobs: {
      playerSyncJob,
      statsSyncJob,
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
