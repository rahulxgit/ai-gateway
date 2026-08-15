import { ProviderHealth, ProviderName } from '../types';
import { providerRegistry } from '../providers/registry';
import { logger } from '../utils/logger';

const LATENCY_WINDOW = 20;
const DEGRADED_LATENCY_MS = 6000;
const DOWN_AFTER_FAILURES = 3;
const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
const QUOTA_COOLDOWN_MS = 30 * 60_000;

interface HealthState extends ProviderHealth {
  recentLatencies: number[];
  cooldownUntil?: number;
}

const state: Record<ProviderName, HealthState> = Object.fromEntries(
  (Object.keys(providerRegistry) as ProviderName[]).map((name) => [
    name,
    {
      provider: name,
      status: providerRegistry[name].isConfigured() ? 'unknown' : 'down',
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: 0,
      recentLatencies: [],
    },
  ])
) as unknown as Record<ProviderName, HealthState>;

export function recordSuccess(provider: ProviderName, latencyMs: number, correlationId?: string): void {
  const s = state[provider];
  s.consecutiveFailures = 0;
  s.cooldownUntil = undefined;
  s.lastCheckedAt = new Date().toISOString();
  s.lastError = undefined;
  s.recentLatencies.push(latencyMs);
  if (s.recentLatencies.length > LATENCY_WINDOW) s.recentLatencies.shift();
  s.avgLatencyMs = Math.round(s.recentLatencies.reduce((a, b) => a + b, 0) / s.recentLatencies.length);
  s.status = s.avgLatencyMs > DEGRADED_LATENCY_MS ? 'degraded' : 'healthy';
  logger.debug('Provider health recorded success', { correlationId, provider, latencyMs, status: s.status });
}

export function recordFailure(
  provider: ProviderName,
  errorCode: string,
  message: string,
  correlationId?: string
): void {
  const s = state[provider];
  s.consecutiveFailures += 1;
  s.lastCheckedAt = new Date().toISOString();
  s.lastError = message;

  if (errorCode === 'QUOTA_EXCEEDED') {
    s.status = 'rate_limited';
    s.cooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
  } else if (errorCode === 'RATE_LIMITED') {
    s.status = 'rate_limited';
    s.cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  } else if (errorCode === 'ACCOUNT_SUSPENDED' || errorCode === 'INSUFFICIENT_CREDITS') {
    s.status = 'down';
    s.cooldownUntil = undefined;
  } else if (s.consecutiveFailures >= DOWN_AFTER_FAILURES) {
    s.status = 'down';
    s.cooldownUntil = undefined;
  } else {
    s.status = 'degraded';
    s.cooldownUntil = undefined;
  }

  logger.warn('Provider health recorded failure', {
    correlationId,
    provider,
    errorCode,
    status: s.status,
    consecutiveFailures: s.consecutiveFailures,
    cooldownUntil: s.cooldownUntil,
  });
}

function restoreAfterCooldown(provider: ProviderName): void {
  const s = state[provider];
  if (!s.cooldownUntil || Date.now() < s.cooldownUntil) return;

  s.cooldownUntil = undefined;
  s.lastCheckedAt = new Date().toISOString();
  s.status = s.avgLatencyMs && s.avgLatencyMs > DEGRADED_LATENCY_MS ? 'degraded' : 'unknown';
  logger.debug('Provider cooldown expired; provider is eligible for a health probe', {
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

/** Returns whether a provider can participate in the current routing attempt. */
export function isLikelyHealthy(provider: ProviderName): boolean {
  restoreAfterCooldown(provider);
  const s = state[provider];
  if (s.status === 'down') return false;
  if (s.cooldownUntil && Date.now() < s.cooldownUntil) return false;
  return true;
}
