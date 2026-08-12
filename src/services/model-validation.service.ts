import { ModelAvailabilityResult, ProviderName } from '../types';
import { providerRegistry, listConfiguredProviders } from '../providers/registry';
import { logger } from '../utils/logger';

// Providers keep deprecating/renaming default models out from under us —
// this bit the gateway in production when Groq pulled
// meta-llama/llama-4-scout-17b-16e-instruct without any code change on our
// side, and the failure only surfaced as a "model not found" error on a
// live request. This runs a best-effort check at startup (and can be
// re-run on demand) so a dead default model shows up as a clear warning
// in logs instead of a silent prod outage.
export interface ModelValidationSummary extends ModelAvailabilityResult {
  provider: ProviderName;
}

// Each call fires a real concurrent network request to every configured
// provider's /models endpoint. That's fine once at startup, but
// GET /health/models can be polled (uptime pingers, dashboards, or repeat
// manual checks) — without caching, every poll re-hits every provider's
// live API even though model catalogs don't change on a per-request
// basis. A short TTL cache avoids redundant concurrent network calls while
// still catching a real deprecation within a few minutes.
const MODEL_VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedResults: ModelValidationSummary[] | null = null;
let cachedAt = 0;

export function invalidateModelValidationCache(): void {
  cachedResults = null;
  cachedAt = 0;
}

export async function validateConfiguredModels(): Promise<ModelValidationSummary[]> {
  const now = Date.now();
  if (cachedResults && now - cachedAt < MODEL_VALIDATION_CACHE_TTL_MS) {
    return cachedResults;
  }

  const configured = listConfiguredProviders();

  const results = await Promise.all(
    configured.map(async (name): Promise<ModelValidationSummary> => {
      const adapter = providerRegistry[name];
      if (!adapter.checkModelAvailability) {
        return { provider: name, status: 'undetermined', model: adapter.defaultModel, detail: 'provider has no models-list endpoint check implemented' };
      }
      const result = await adapter.checkModelAvailability();
      return { provider: name, ...result };
    })
  );

  const unavailable = results.filter((r) => r.status === 'unavailable');
  if (unavailable.length > 0) {
    for (const r of unavailable) {
      logger.warn(
        `Provider "${r.provider}" default model "${r.model}" was NOT found in the provider's live model list — it may have been deprecated. Update defaultModel in src/providers/${r.provider}.adapter.ts. (${r.detail})`
      );
    }
  } else {
    logger.info(`Model validation: all ${results.length} checkable provider default models are live.`, {
      checked: results.filter((r) => r.status !== 'undetermined').map((r) => r.provider),
      skipped: results.filter((r) => r.status === 'undetermined').map((r) => r.provider),
    });
  }

  cachedResults = results;
  cachedAt = now;
  return results;
}
