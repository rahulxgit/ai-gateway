import { ProviderHealth, ProviderName } from '../types';
import { providerRegistry } from '../providers/registry';
import { logger } from '../utils/logger';

const LATENCY_WINDOW = 20;
const DEGRADED_LATENCY_MS = 6000;
const DEGRADED_AFTER_FAILURES = 3;

// Cooldown durations per status bucket. All of these are heuristics about
// how long a given failure class typically takes to resolve on its own —
// see routeChat's probe-anyway fallback (router.service.ts) for what
// happens if every eligible provider ends up cooldown-gated at once: the
// gateway still makes a real attempt rather than trusting these blindly.
const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
const QUOTA_COOLDOWN_MS = 30 * 60_000;
// auth_error / billing_required / model_unavailable / retired don't
// self-heal on a timer the way a rate limit does (a bad key stays bad
// until someone rotates it) — but still get a bounded cooldown rather
// than an infinite one, since the background health-check service
// (health-check.service.ts) re-probes on its own schedule and a fix on
// the provider's end (or the person rotating a key) should surface again
// within a reasonable window instead of requiring a process restart.
const NON_SELF_HEALING_COOLDOWN_MS = 10 * 60_000;

interface HealthState extends ProviderHealth {
  recentLatencies: number[];
  cooldownUntil?: number;
}

const state: Record<ProviderName, HealthState> = Object.fromEntries(
  (Object.keys(providerRegistry) as ProviderName[]).map((name) => [
    name,
    {
      provider: name,
      // 'configured': has a key, never probed/used yet. 'unknown': no key
      // at all, so there's nothing to report and it will never become an
      // automatic-routing candidate regardless of status.
      status: providerRegistry[name].isConfigured() ? 'configured' : 'unknown',
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: 0,
      recentLatencies: [],
    },
  ])
) as unknown as Record<ProviderName, HealthState>;

export function recordSuccess(
  provider: ProviderName,
  latencyMs: number,
  correlationId?: string,
  source: 'traffic' | 'probe' = 'traffic'
): void {
  const s = state[provider];
  s.consecutiveFailures = 0;
  s.cooldownUntil = undefined;
  s.lastCheckedAt = new Date().toISOString();
  s.lastCheckSource = source;
  s.lastError = undefined;
  s.recentLatencies.push(latencyMs);
  if (s.recentLatencies.length > LATENCY_WINDOW) s.recentLatencies.shift();
  s.avgLatencyMs = Math.round(s.recentLatencies.reduce((a, b) => a + b, 0) / s.recentLatencies.length);
  s.status = s.avgLatencyMs > DEGRADED_LATENCY_MS ? 'degraded' : 'healthy';
  logger.debug('Provider health recorded success', { correlationId, provider, latencyMs, status: s.status, source });
}

// Maps a classifyError() ProviderErrorCode onto the health-status taxonomy.
// Both real routed traffic (router.service.ts) and the background prober
// (health-check.service.ts) funnel through this same function via
// recordFailure, so a given underlying cause always reads identically in
// /health regardless of which path detected it.
function statusForErrorCode(errorCode: string, consecutiveFailures: number): { status: ProviderHealth['status']; cooldownMs?: number } {
  switch (errorCode) {
    case 'QUOTA_EXCEEDED':
      return { status: 'rate_limited', cooldownMs: QUOTA_COOLDOWN_MS };
    case 'RATE_LIMITED':
      return { status: 'rate_limited', cooldownMs: RATE_LIMIT_COOLDOWN_MS };
    case 'AUTH_ERROR':
      return { status: 'auth_error', cooldownMs: NON_SELF_HEALING_COOLDOWN_MS };
    case 'ACCOUNT_SUSPENDED':
    case 'INSUFFICIENT_CREDITS':
      return { status: 'billing_required', cooldownMs: NON_SELF_HEALING_COOLDOWN_MS };
    case 'NOT_FOUND':
      return { status: 'model_unavailable', cooldownMs: NON_SELF_HEALING_COOLDOWN_MS };
    case 'UNAVAILABLE':
      return { status: 'retired', cooldownMs: NON_SELF_HEALING_COOLDOWN_MS };
    default:
      // SERVER_ERROR, TIMEOUT, INVALID_REQUEST, UNKNOWN: treated as
      // transient at first (no cooldown, still eligible) but escalated to
      // 'retired' with a cooldown after repeated consecutive failures —
      // same threshold-escalation behavior as the old generic 'down'
      // bucket, just landing on the taxonomy's closest equivalent name.
      if (consecutiveFailures >= DEGRADED_AFTER_FAILURES) {
        return { status: 'retired', cooldownMs: NON_SELF_HEALING_COOLDOWN_MS };
      }
      return { status: 'degraded' };
  }
}

export function recordFailure(
  provider: ProviderName,
  errorCode: string,
  message: string,
  correlationId?: string,
  source: 'traffic' | 'probe' = 'traffic'
): void {
  const s = state[provider];
  s.consecutiveFailures += 1;
  s.lastCheckedAt = new Date().toISOString();
  s.lastCheckSource = source;
  s.lastError = message;

  const { status, cooldownMs } = statusForErrorCode(errorCode, s.consecutiveFailures);
  s.status = status;
  s.cooldownUntil = cooldownMs ? Date.now() + cooldownMs : undefined;

  logger.warn('Provider health recorded failure', {
    correlationId,
    provider,
    errorCode,
    status: s.status,
    consecutiveFailures: s.consecutiveFailures,
    cooldownUntil: s.cooldownUntil,
    source,
  });
}

function restoreAfterCooldown(provider: ProviderName): void {
  const s = state[provider];
  if (!s.cooldownUntil || Date.now() < s.cooldownUntil) return;

  s.cooldownUntil = undefined;
  s.lastCheckedAt = new Date().toISOString();
  s.consecutiveFailures = 0;
  s.status = s.avgLatencyMs && s.avgLatencyMs > DEGRADED_LATENCY_MS ? 'degraded' : 'unknown';
  logger.debug('Provider cooldown expired; provider is eligible again', {
    provider,
    status: s.status,
  });
}

export function getHealthSnapshot(): ProviderHealth[] {
  return (Object.keys(state) as ProviderName[]).map((name) => {
    restoreAfterCooldown(name);
    const { recentLatencies, cooldownUntil, ...health } = state[name];
    void recentLatencies;
    void cooldownUntil;
    return health;
  });
}

// Used by health-check.service.ts to skip re-probing a provider whose
// status was already confirmed recently — either by real traffic or by a
// previous probe — so the background prober doesn't waste API calls on
// providers we already have fresh information about. Rate-limit-safe and
// low API usage by construction rather than by a fixed provider allowlist.
export function isRecentlyChecked(provider: ProviderName, withinMs: number): boolean {
  const s = state[provider];
  return Date.now() - new Date(s.lastCheckedAt).getTime() < withinMs;
}

/**
 * Returns whether a provider can participate in an automatic routing attempt.
 * Healthy, degraded, configured (untested), and unknown statuses are
 * eligible; rate_limited/auth_error/billing_required/model_unavailable/
 * retired are skipped until their cooldown expires.
 */
export function isLikelyHealthy(provider: ProviderName): boolean {
  restoreAfterCooldown(provider);
  const s = state[provider];
  if (s.cooldownUntil && Date.now() < s.cooldownUntil) return false;
  return true;
}
