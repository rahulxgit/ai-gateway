import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { apiRateLimiter, errorHandler, notFoundHandler, sanitizeInput } from './middleware';
import chatRoutes from './routes/chat.routes';
import sessionRoutes from './routes/session.routes';
import analyticsRoutes from './routes/analytics.routes';
import projectRoutes from './routes/project.routes';
import uploadRoutes from './routes/upload.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  // Base64-encoded images in chat requests can be large (a single 15MB
  // image is ~20MB as base64); 2mb was fine for text-only payloads but
  // would reject every image-bearing request.
  app.use(express.json({ limit: '50mb' }));
  app.use(sanitizeInput);
  app.use(apiRateLimiter);

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
