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

  // Keep normal JSON payloads small. Chat routes install their own parser so
  // image-bearing requests can opt into the existing 50mb ceiling without
  // giving every endpoint that same memory budget.
  app.use(express.json({ limit: '2mb' }));
  app.use(sanitizeInput);

  app.use(apiRateLimiter);
  app.use('/health', apiReadRateLimiter);
  app.use('/providers', apiReadRateLimiter);
  app.use('/chat', apiChatRateLimiter);

  app.get('/', (_req, res) => res.json({ name: 'AI Gateway', status: 'running' }));

  app.use(chatRoutes);
  app.use(sessionRoutes);
  app.use(analyticsRoutes);
  app.use(projectRoutes);
  app.use(uploadRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
