import { createServer } from 'http';
import { config } from './config';
import { createContainer } from './container';
import { createApp } from './app';
import { createChatGateway } from './modules/chat/chat.gateway';
import { createDraftGateway } from './modules/drafts/draft.gateway';
import { createTransactionsGateway } from './modules/transactions/transactions.gateway';
import { createMatchupDerbyGateway } from './modules/matchups/matchup-derby.gateway';
import { Redis } from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';

let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

const container = createContainer();
const app = createApp(container);
const server = createServer(app);

// Attach Socket.IO after HTTP server creation
const io = createChatGateway(server, container.services.chatService);

// Optionally attach Redis adapter for multi-instance Socket.IO scaling.
// NOTE: The in-memory chat rate-limit map in chat.gateway.ts will NOT sync
// across instances. This is acceptable — the rate limit is a convenience
// throttle, not a security boundary.
if (config.REDIS_URL) {
  redisPub = new Redis(config.REDIS_URL);
  redisSub = redisPub.duplicate();
  io.adapter(createAdapter(redisPub, redisSub));
  console.log('Socket.IO Redis adapter attached');
}

// Attach draft gateway on the same socket.io server and inject into service
const draftGateway = createDraftGateway(
  io,
  container.repositories.draftRepository,
  container.services.chatService,
);
container.services.draftService.setGateway(draftGateway);
container.services.draftClockService.setGateway(draftGateway);
container.services.autoPickService.setGateway(draftGateway);
container.services.auctionAutoBidService.setGateway(draftGateway);
container.services.auctionService.setGateway(draftGateway);
container.services.slowAuctionService.setGateway(draftGateway);
container.services.derbyService.setGateway(draftGateway);

// Attach matchup derby gateway and inject into service
const matchupDerbyGateway = createMatchupDerbyGateway(
  io,
  container.repositories.leagueRepository,
);
container.services.matchupDerbyService.setGateway(matchupDerbyGateway);

// Attach transactions gateway and inject into services
const transactionsGateway = createTransactionsGateway(io);
container.services.tradeService.setGateway(transactionsGateway);
container.services.transactionService.setGateway(transactionsGateway);

// Inject Socket.IO into system message service for real-time broadcasting
container.services.systemMessageService.setIO(io);
container.services.tradeService.setSystemMessages(container.services.systemMessageService);
container.services.transactionService.setSystemMessages(container.services.systemMessageService);

// Start auction jobs only when background jobs are enabled
if (config.ENABLE_JOBS) {
  container.jobs.auctionTimerJob.start();
  container.jobs.slowAuctionSettlementJob.start();
  container.jobs.autoPickJob.start();
}

server.listen(config.PORT, '0.0.0.0', () => {
  console.log(`TBDFF Backend started on port ${config.PORT}`);
  console.log(`Health check: http://localhost:${config.PORT}/api/health`);
});

// Graceful shutdown
let isShuttingDown = false;
const gracefulShutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('Shutting down gracefully...');

  io.close();
  if (redisPub) redisPub.disconnect();
  if (redisSub) redisSub.disconnect();
  if (config.ENABLE_JOBS) {
    container.jobs.auctionTimerJob.stop();
    container.jobs.slowAuctionSettlementJob.stop();
    container.jobs.autoPickJob.stop();
  }

  server.close(async () => {
    console.log('HTTP server closed');
    container.pool.removeAllListeners();
    await container.pool.end();
    console.log('Database pool closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception', error.message);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection', String(reason));
  gracefulShutdown();
});
