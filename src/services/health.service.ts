import { ProviderHealth, ProviderName } from '../types';
import { providerRegistry } from '../providers/registry';

const LATENCY_WINDOW = 20;
const DEGRADED_LATENCY_MS = 6000;
const DOWN_AFTER_FAILURES = 3;

interface HealthState extends ProviderHealth {
  recentLatencies: number[];
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

export function recordSuccess(provider: ProviderName, latencyMs: number): void {
  const s = state[provider];
  s.consecutiveFailures = 0;
  s.lastCheckedAt = new Date().toISOString();
  s.lastError = undefined;
  s.recentLatencies.push(latencyMs);
  if (s.recentLatencies.length > LATENCY_WINDOW) s.recentLatencies.shift();
  s.avgLatencyMs = Math.round(
    s.recentLatencies.reduce((a, b) => a + b, 0) / s.recentLatencies.length
  );
  s.status = s.avgLatencyMs > DEGRADED_LATENCY_MS ? 'degraded' : 'healthy';
}

export function recordFailure(
  provider: ProviderName,
  errorCode: string,
  message: string
): void {
  const s = state[provider];
  s.consecutiveFailures += 1;
  s.lastCheckedAt = new Date().toISOString();
  s.lastError = message;

  if (errorCode === 'RATE_LIMITED' || errorCode === 'QUOTA_EXCEEDED') {
    s.status = 'rate_limited';
  } else if (s.consecutiveFailures >= DOWN_AFTER_FAILURES) {
    s.status = 'down';
  } else {
    s.status = 'degraded';
  }
}

export function getHealthSnapshot(): ProviderHealth[] {
  return (Object.keys(state) as ProviderName[]).map((name) => {
    const { recentLatencies, ...health } = state[name];
    void recentLatencies;
    return health;
  });
}

export function isLikelyHealthy(provider: ProviderName): boolean {
  const s = state[provider];
  return s.status !== 'down' && s.status !== 'rate_limited';
}
