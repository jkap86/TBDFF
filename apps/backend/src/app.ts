import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { Container } from './container';
import { registerRoutes } from './routes';
import { errorHandler } from './shared/error-handler';
import { ipMutationLimiter } from './middleware/rate-limit.middleware';

export function createApp(container: Container) {
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
    origin: config.CORS_ORIGINS,
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Coarse IP-keyed rate limit on all mutation endpoints (POST/PUT/PATCH/DELETE)
  app.use('/api', ipMutationLimiter);

  registerRoutes(app, container);

  // Error handler (must be last middleware)
  app.use(errorHandler);

  return app;
}
