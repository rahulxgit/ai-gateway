import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { db, runMigrations } from './database/client';
import { logger } from './utils/logger';
import { listConfiguredProviders } from './providers/registry';
import { validateConfiguredModels } from './services/model-validation.service';

const SHUTDOWN_DRAIN_TIMEOUT_MS = 30_000;

export function createGracefulShutdown(
  server: http.Server,
  closeDatabase: () => void = () => db.close(),
  drainTimeoutMs = SHUTDOWN_DRAIN_TIMEOUT_MS
): () => void {
  let shuttingDown = false;

  return () => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info('Graceful shutdown initiated');

    const forceCloseTimer = setTimeout(() => {
      logger.warn('Graceful shutdown drain timeout reached; forcing connection close');
      server.closeAllConnections?.();
    }, drainTimeoutMs);
    forceCloseTimer.unref?.();

    server.close((err) => {
      clearTimeout(forceCloseTimer);

      if (err) {
        logger.error('HTTP server failed to close cleanly', { error: err.message });
      } else {
        logger.info('HTTP server drained successfully');
      }

      try {
        closeDatabase();
        logger.info('Database connection closed');
        if (err) {
          process.exitCode = 1;
        }
      } catch (closeErr) {
        logger.error('Database failed to close cleanly', {
          error: closeErr instanceof Error ? closeErr.message : String(closeErr),
        });
        process.exitCode = 1;
      }
    });
  };
}

export function registerGracefulShutdown(
  server: http.Server,
  closeDatabase: () => void = () => db.close()
): () => void {
  const shutdown = createGracefulShutdown(server, closeDatabase);
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return shutdown;
}

runMigrations();

const app = createApp();
const configured = listConfiguredProviders();

if (configured.length === 0) {
  logger.warn('No providers are configured. Set at least one *_API_KEY in .env before sending requests.');
}

const server = app.listen(env.port, () => {
  logger.info(`AI Gateway listening on port ${env.port}`, {
    env: env.nodeEnv,
    configuredProviders: configured,
  });

  // Fire-and-forget: checks each configured provider's default model
  // against its live /models catalog and logs a warning for anything
  // that's been deprecated provider-side. Never blocks startup or crashes
  // the process — worst case it logs nothing useful for providers whose
  // check failed or isn't supported.
  validateConfiguredModels().catch((err) => {
    logger.warn('Model validation check failed to run', { error: String(err) });
  });
});

registerGracefulShutdown(server);
