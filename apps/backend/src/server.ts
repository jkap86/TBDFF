import { createServer } from 'http';
import { config } from './config';
import { createContainer } from './container';
import { createApp } from './app';

const container = createContainer();
const app = createApp(container);
const server = createServer(app);

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
