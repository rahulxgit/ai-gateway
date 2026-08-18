import { ProviderError, ProviderName } from '../types';
import { providerRegistry, listConfiguredProviders } from '../providers/registry';
import { recordSuccess, recordFailure, isRecentlyChecked } from './health.service';
import { logger } from '../utils/logger';

// How often the background interval re-probes providers. Deliberately
// coarse (5 min) — this is a liveness check, not a latency benchmark, and
// real routed traffic already keeps healthy/failing providers' status
// fresh in between ticks via recordSuccess/recordFailure in
// router.service.ts.
const HEALTH_CHECK_INTERVAL_MS = 5 * 60_000;

// Skip re-probing a provider if we already have a reading (from either a
// real request or a previous probe) newer than this. Set just under the
// interval so a provider that's seeing real traffic between ticks doesn't
// also get a redundant probe request — "minimal API usage, rate-limit
// safe" from the brief, enforced structurally rather than by a allowlist.
const SKIP_IF_CHECKED_WITHIN_MS = HEALTH_CHECK_INTERVAL_MS - 30_000;

// Delay between each provider's probe within a single sweep. Probing all
// ~20 configured providers back-to-back with zero spacing is the kind of
// synchronized burst that trips shared infra (a proxy, a NAT gateway) even
// though each individual provider only sees one request — staggering
// avoids that without meaningfully slowing down startup.
const STAGGER_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeOne(provider: ProviderName): Promise<void> {
  const adapter = providerRegistry[provider];
  if (!adapter.probeHealth) {
    // No lightweight probe implemented for this adapter — leave its status
    // exactly as real traffic last left it rather than guessing.
    return;
  }

  const start = Date.now();
  try {
    await adapter.probeHealth();
    recordSuccess(provider, Date.now() - start, undefined, 'probe');
  } catch (err) {
    const pErr = err instanceof ProviderError ? err : undefined;
    recordFailure(provider, pErr?.code ?? 'UNKNOWN', (err as Error).message, undefined, 'probe');
  }
}

async function runSweep(providers: ProviderName[]): Promise<void> {
  for (const provider of providers) {
    if (isRecentlyChecked(provider, SKIP_IF_CHECKED_WITHIN_MS)) {
      logger.debug('Skipping health probe — recently checked by traffic or a prior probe', { provider });
      continue;
    }
    await probeOne(provider);
    await sleep(STAGGER_MS);
  }
}

let intervalHandle: ReturnType<typeof setInterval> | undefined;

// Fire-and-forget, non-blocking: called once at server startup (same
// pattern as validateConfiguredModels() in model-validation.service.ts).
// Populates the health cache with real data before most frontend requests
// arrive, without making server.listen() wait on ~20 sequential network
// calls first. Every configured provider is probed on this first sweep
// regardless of isRecentlyChecked, since at startup nothing has been
// checked yet.
export async function runStartupHealthChecks(): Promise<void> {
  const configured = listConfiguredProviders();
  if (configured.length === 0) return;

  logger.info('Running startup health checks', { providers: configured });
  for (const provider of configured) {
    await probeOne(provider);
    await sleep(STAGGER_MS);
  }
  logger.info('Startup health checks complete');
}

// Begins the recurring background sweep. Safe to call once at process
// start; calling it twice (e.g. across a hot-reload in dev) would double
// up the interval, so it's guarded against re-arming.
export function scheduleHealthCheckInterval(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    runSweep(listConfiguredProviders()).catch((err) => {
      logger.warn('Background health-check sweep failed to complete', { error: String(err) });
    });
  }, HEALTH_CHECK_INTERVAL_MS);
  // Don't hold the process open just for this timer during graceful
  // shutdown / in tests.
  intervalHandle.unref?.();
}

export function stopHealthCheckInterval(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
}
