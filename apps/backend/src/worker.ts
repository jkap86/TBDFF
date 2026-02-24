import { config } from './config';
import { createContainer } from './container';

const container = createContainer();

if (!config.ENABLE_JOBS) {
  console.log('ENABLE_JOBS=false, worker exiting');
  container.pool.end();
  process.exit(0);
}

container.jobs.playerSyncJob.start();
container.jobs.statsSyncJob.start();
console.log('TBDFF Worker started — background jobs running');

// Graceful shutdown
let isShuttingDown = false;
const gracefulShutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('Worker shutting down...');

  container.jobs.playerSyncJob.stop();
  container.jobs.statsSyncJob.stop();

  container.pool.removeAllListeners();
  container.pool.end().then(() => {
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
