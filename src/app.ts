import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import {
  apiChatRateLimiter,
  apiRateLimiter,
  apiReadRateLimiter,
  errorHandler,
  notFoundHandler,
  requestCorrelationId,
  sanitizeInput,
} from './middleware';
import chatRoutes from './routes/chat.routes';
import sessionRoutes from './routes/session.routes';
import analyticsRoutes from './routes/analytics.routes';
import projectRoutes from './routes/project.routes';
import uploadRoutes from './routes/upload.routes';

export function createApp() {
  const app = express();

  app.use(requestCorrelationId);
  app.use(helmet());
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : ['*'];
  app.use(cors({ origin: corsOrigins.length > 1 ? corsOrigins : corsOrigins[0] ?? '*' }));

  // Chat routes install their own 50mb JSON parser first so existing
  // image-bearing requests continue to work. All remaining routes use the
  // smaller 2mb parser below.
  app.use('/chat', apiChatRateLimiter);
  app.use(chatRoutes);

  app.use(express.json({ limit: '2mb' }));
  app.use(sanitizeInput);

  app.use(apiRateLimiter);
  app.use('/health', apiReadRateLimiter);
  app.use('/providers', apiReadRateLimiter);

  app.get('/', (_req, res) => res.json({ name: 'AI Gateway', status: 'running' }));

  app.use(sessionRoutes);
  app.use(analyticsRoutes);
  app.use(projectRoutes);
  app.use(uploadRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
