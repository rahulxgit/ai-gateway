import { createApp } from './app';
import { env } from './config/env';
import { runMigrations } from './database/client';
import { logger } from './utils/logger';
import { listConfiguredProviders } from './providers/registry';

runMigrations();

const app = createApp();
const configured = listConfiguredProviders();

if (configured.length === 0) {
  logger.warn('No providers are configured. Set at least one *_API_KEY in .env before sending requests.');
}

app.listen(env.port, () => {
  logger.info(`AI Gateway listening on port ${env.port}`, {
    env: env.nodeEnv,
    configuredProviders: configured,
  });
});
