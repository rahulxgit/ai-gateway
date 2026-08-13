import http from 'http';
import { db } from '../database/client';
import { logger } from './logger';
import { closeRedisCache } from './redis-cache';

export const SHUTDOWN_DRAIN_TIMEOUT_MS = 30_000;

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
        closeRedisCache();
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
