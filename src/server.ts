import { createApp } from './app';
import { env } from './config/env';
import { runMigrations } from './database/client';
import { logger } from './utils/logger';
import { listConfiguredProviders } from './providers/registry';
import { validateConfiguredModels } from './services/model-validation.service';

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

  // Fire-and-forget: checks each configured provider's default model
  // against its live /models catalog and logs a warning for anything
  // that's been deprecated provider-side. Never blocks startup or crashes
  // the process — worst case it logs nothing useful for providers whose
  // check failed or isn't supported.
  validateConfiguredModels().catch((err) => {
    logger.warn('Model validation check failed to run', { error: String(err) });
  });
});
