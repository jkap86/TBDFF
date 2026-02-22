import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { createAuthRoutes } from './modules/auth/auth.routes';
import { createLeagueRoutes } from './modules/leagues/leagues.routes';
import { createInviteRoutes } from './modules/leagues/invites.routes';
import { createPlayerRoutes } from './modules/players/players.routes';
import { PlayerSyncJob } from './jobs/player-sync.job';
import { errorHandler } from './shared/error-handler';

dotenv.config();

const PORT = parseInt(process.env.PORT || '5000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error', err.message);
});

// Express app
const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hidePoweredBy: true,
  })
);
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || [
    'http://localhost:3000',
    'http://localhost:8081',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', async (_req, res) => {
  let dbHealthy = true;
  try {
    await pool.query('SELECT 1');
  } catch {
    dbHealthy = false;
  }

  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'ok' : 'error',
  });
});

// Pool metrics (dev only)
if (NODE_ENV === 'development') {
  app.get('/api/metrics', (_req, res) => {
    res.json({
      timestamp: new Date().toISOString(),
      pool: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      },
    });
  });
}

// Routes
app.use('/api/auth', createAuthRoutes(pool));
app.use('/api/leagues', createLeagueRoutes(pool));
app.use('/api/invites', createInviteRoutes(pool));
app.use('/api/players', createPlayerRoutes(pool));

// Error handler (must be last middleware)
app.use(errorHandler);

// Start server
const server = createServer(app);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TBDFF Backend started on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);

  // Start background jobs
  const playerSyncJob = new PlayerSyncJob(pool);
  playerSyncJob.start();
  console.log('Background jobs started');
});

// Graceful shutdown
let isShuttingDown = false;
const gracefulShutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('Shutting down gracefully...');

  server.close(async () => {
    console.log('HTTP server closed');
    pool.removeAllListeners();
    await pool.end();
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
