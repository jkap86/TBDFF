import { Express } from 'express';
import { Container } from '../container';
import { createAuthRoutes } from '../modules/auth/auth.routes';
import { createLeagueRoutes } from '../modules/leagues/leagues.routes';
import { createInviteRoutes } from '../modules/leagues/invites.routes';
import { createPlayerRoutes } from '../modules/players/players.routes';
import { createDraftRoutes, createDraftLeagueRoutes } from '../modules/drafts/drafts.routes';
import { createMatchupRoutes } from '../modules/matchups/matchups.routes';
import { createScoringRoutes, createLeagueScoringRoutes } from '../modules/scoring/scoring.routes';

export function registerRoutes(app: Express, container: Container): void {
  const { controllers, pool } = container;

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
  if (process.env.NODE_ENV === 'development') {
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

  // Module routes
  app.use('/api/auth', createAuthRoutes(controllers.authController));
  app.use('/api/leagues', createLeagueRoutes(controllers.leagueController));
  app.use('/api/invites', createInviteRoutes(controllers.leagueController));
  app.use('/api/players', createPlayerRoutes(controllers.playerController));
  app.use('/api/drafts', createDraftRoutes(controllers.draftController));
  app.use('/api/leagues', createDraftLeagueRoutes(controllers.draftController));
  app.use('/api/leagues', createMatchupRoutes(controllers.matchupController));
  app.use('/api/scoring', createScoringRoutes(controllers.scoringController));
  app.use('/api/leagues', createLeagueScoringRoutes(controllers.scoringController));
}
