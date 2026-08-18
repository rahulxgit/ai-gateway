import { createApp } from './app';
import { env } from './config/env';
import { runMigrations } from './database/client';
import { logger } from './utils/logger';
import { listConfiguredProviders } from './providers/registry';
import { validateConfiguredModels } from './services/model-validation.service';
import { runStartupHealthChecks, scheduleHealthCheckInterval, stopHealthCheckInterval } from './services/health-check.service';
import { registerGracefulShutdown } from './utils/graceful-shutdown';

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

  // Fire-and-forget, same reasoning: populates the health cache with real
  // provider status before it's otherwise been exercised by user traffic,
  // without making the server wait on ~20 sequential network calls before
  // it can accept its first request. Then hands off to a recurring
  // background sweep so status stays fresh even during idle periods with
  // no chat traffic at all.
  runStartupHealthChecks()
    .then(() => scheduleHealthCheckInterval())
    .catch((err) => {
      logger.warn('Startup health checks failed to run', { error: String(err) });
      scheduleHealthCheckInterval();
    });
});

registerGracefulShutdown(server, undefined, () => stopHealthCheckInterval());
