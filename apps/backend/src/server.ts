import { createServer } from 'http';
import { config } from './config';
import { createContainer } from './container';
import { createApp } from './app';
import { createChatGateway } from './modules/chat/chat.gateway';
import { createDraftGateway } from './modules/drafts/draft.gateway';
import { createTransactionsGateway } from './modules/transactions/transactions.gateway';

const container = createContainer();
const app = createApp(container);
const server = createServer(app);

// Attach Socket.IO after HTTP server creation
const io = createChatGateway(server, container.services.chatService);

// Attach draft gateway on the same socket.io server and inject into service
const draftGateway = createDraftGateway(
  io,
  container.repositories.draftRepository,
  container.services.chatService,
);
container.services.draftService.setGateway(draftGateway);
container.services.auctionService.setGateway(draftGateway);
container.services.slowAuctionService.setGateway(draftGateway);

// Attach transactions gateway and inject into services
const transactionsGateway = createTransactionsGateway(io);
container.services.tradeService.setGateway(transactionsGateway);
container.services.transactionService.setGateway(transactionsGateway);

// Start auction timer job (replaces in-memory timers with DB-backed polling)
container.jobs.auctionTimerJob.start();

// Start slow auction settlement job
container.jobs.slowAuctionSettlementJob.start();

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
  container.jobs.auctionTimerJob.stop();
  container.jobs.slowAuctionSettlementJob.stop();

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
