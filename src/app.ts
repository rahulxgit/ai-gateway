import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { apiRateLimiter, errorHandler, notFoundHandler, sanitizeInput } from './middleware';
import chatRoutes from './routes/chat.routes';
import sessionRoutes from './routes/session.routes';
import analyticsRoutes from './routes/analytics.routes';
import projectRoutes from './routes/project.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '2mb' }));
  app.use(sanitizeInput);
  app.use(apiRateLimiter);

  app.get('/', (_req, res) => res.json({ name: 'AI Gateway', status: 'running' }));

  app.use(chatRoutes);
  app.use(sessionRoutes);
  app.use(analyticsRoutes);
  app.use(projectRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
