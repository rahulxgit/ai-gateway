import {
  ProviderError,
  ProviderErrorCode,
  ProviderHealth,
  ProviderHealthStatus,
  ProviderName,
} from '../types';
import { providerRegistry } from '../providers/registry';
import { FREE_AUTO_PROVIDERS } from '../config/routing';
import { logger } from '../utils/logger';

const LATENCY_WINDOW = 20;
const DEGRADED_LATENCY_MS = 6000;
const DOWN_AFTER_FAILURES = 3;
const HEALTH_REFRESH_TTL_MS = 120_000;
const HEALTH_PROBE_TIMEOUT_MS = 8_000;
const HEALTH_PROBE_MAX_TOKENS = 1;

interface HealthState extends ProviderHealth {
  recentLatencies: number[];
}

const state: Record<ProviderName, HealthState> = Object.fromEntries(
  (Object.keys(providerRegistry) as ProviderName[]).map((name) => [
    name,
    {
      provider: name,
      status: providerRegistry[name].isConfigured() ? 'unknown' : 'down',
      statusMessage: providerRegistry[name].isConfigured() ? 'Health check pending' : 'API key not configured',
      lastCheckedAt: new Date(0).toISOString(),
      consecutiveFailures: 0,
      recentLatencies: [],
    },
  ])
) as unknown as Record<ProviderName, HealthState>;

let lastRefreshAt = 0;
let refreshInFlight: Promise<void> | null = null;

function statusFromErrorCode(code: ProviderErrorCode): ProviderHealthStatus {
  switch (code) {
    case 'AUTH_ERROR': return 'authentication_failed';
    case 'FORBIDDEN': return 'forbidden';
    case 'RATE_LIMITED': return 'rate_limited';
    case 'QUOTA_EXCEEDED':
    case 'INSUFFICIENT_CREDITS': return 'quota_exhausted';
    case 'NOT_FOUND': return 'model_unavailable';
    case 'ACCOUNT_SUSPENDED': return 'account_suspended';
    case 'TIMEOUT':
    case 'UNAVAILABLE': return 'unavailable';
    default: return 'degraded';
  }
}

function timeoutError(provider: ProviderName): ProviderError {
  return new ProviderError(provider, 'TIMEOUT', `${provider}: health probe exceeded ${HEALTH_PROBE_TIMEOUT_MS}ms`);
}

async function withProbeTimeout<T>(provider: ProviderName, work: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(timeoutError(provider)), HEALTH_PROBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function recordSuccess(provider: ProviderName, latencyMs: number, correlationId?: string): void {
  const s = state[provider];
  s.consecutiveFailures = 0;
  s.lastCheckedAt = new Date().toISOString();
  s.lastError = undefined;
  s.errorCode = undefined;
  s.statusMessage = latencyMs > DEGRADED_LATENCY_MS
    ? 'Working but slow'
    : 'API reachable and inference succeeded';
  s.recentLatencies.push(latencyMs);
  if (s.recentLatencies.length > LATENCY_WINDOW) s.recentLatencies.shift();
  s.avgLatencyMs = Math.round(s.recentLatencies.reduce((a, b) => a + b, 0) / s.recentLatencies.length);
  s.status = s.avgLatencyMs > DEGRADED_LATENCY_MS ? 'degraded' : 'healthy';
  logger.debug('Provider health recorded success', { correlationId, provider, latencyMs, status: s.status });
}

function recordFailure(provider: ProviderName, errorCode: ProviderErrorCode, message: string): void {
  const s = state[provider];
  s.consecutiveFailures += 1;
  s.lastCheckedAt = new Date().toISOString();
  s.lastError = message;
  s.errorCode = errorCode;
  const classifiedStatus = statusFromErrorCode(errorCode);

  if (
    ['AUTH_ERROR', 'FORBIDDEN', 'RATE_LIMITED', 'QUOTA_EXCEEDED', 'INSUFFICIENT_CREDITS', 'NOT_FOUND', 'ACCOUNT_SUSPENDED'].includes(errorCode)
  ) {
    s.status = classifiedStatus;
  } else if (s.consecutiveFailures >= DOWN_AFTER_FAILURES) {
    s.status = 'down';
  } else {
    s.status = classifiedStatus;
  }

  s.statusMessage = message;
}

function errorFromCatalogDetail(provider: ProviderName, detail?: string): ProviderError | null {
  const message = detail ?? '';
  if (!message) return null;
  if (/\b401\b|invalid (api[-_ ]?key|token|credential)|unauthorized|authentication failed|not authenticated/i.test(message)) {
    return new ProviderError(provider, 'AUTH_ERROR', `${provider}: ${message}`, 401);
  }
  if (/\b403\b|forbidden|access denied|cloudflare/i.test(message)) {
    return new ProviderError(provider, 'FORBIDDEN', `${provider}: ${message}`, 403);
  }
  if (/\b429\b|rate.?limit|quota|too many requests/i.test(message)) {
    return new ProviderError(provider, 'RATE_LIMITED', `${provider}: ${message}`, 429);
  }
  if (/\b5\d\d\b|timeout|network error|unreachable/i.test(message)) {
    return new ProviderError(provider, 'UNAVAILABLE', `${provider}: ${message}`);
  }
  return null;
}

function recordProbeFailure(provider: ProviderName, err: unknown): void {
  const pErr = err instanceof ProviderError
    ? err
    : new ProviderError(provider, 'UNKNOWN', `${provider}: ${(err as Error)?.message ?? String(err)}`);
  recordFailure(provider, pErr.code, pErr.message);
}

async function probeFreeProvider(provider: ProviderName): Promise<void> {
  const adapter = providerRegistry[provider];
  const startedAt = Date.now();
  try {
    const response = await withProbeTimeout(
      provider,
      adapter.chat({
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        temperature: 0,
        maxTokens: HEALTH_PROBE_MAX_TOKENS,
      })
    );
    state[provider].model = response.model;
    recordSuccess(provider, Date.now() - startedAt);
  } catch (err) {
    recordProbeFailure(provider, err);
  }
}

async function probePaidProviderCredentials(provider: ProviderName): Promise<void> {
  const adapter = providerRegistry[provider];
  if (!adapter.checkModelAvailability) {
    state[provider].status = 'paid_only';
    state[provider].lastCheckedAt = new Date().toISOString();
    state[provider].statusMessage = 'Configured paid provider; excluded from automatic free inference checks.';
    return;
  }

  try {
    const availability = await withProbeTimeout(provider, adapter.checkModelAvailability());
    state[provider].model = availability.model;

    if (availability.status === 'available') {
      state[provider].status = 'paid_only';
      state[provider].lastCheckedAt = new Date().toISOString();
      state[provider].lastError = undefined;
      state[provider].errorCode = undefined;
      state[provider].statusMessage = 'Authentication/model check passed; paid provider excluded from automatic free routing.';
      state[provider].consecutiveFailures = 0;
      return;
    }

    if (availability.status === 'unavailable') {
      recordFailure(
        provider,
        'NOT_FOUND',
        `${provider}: configured default model "${availability.model}" is unavailable. ${availability.detail ?? ''}`.trim()
      );
      return;
    }

    const classified = errorFromCatalogDetail(provider, availability.detail);
    if (classified) {
      recordFailure(provider, classified.code, classified.message);
      return;
    }

    state[provider].status = 'paid_only';
    state[provider].lastCheckedAt = new Date().toISOString();
    state[provider].statusMessage = 'Paid provider configured; credentials could not be conclusively validated without an inference call.';
  } catch (err) {
    recordProbeFailure(provider, err);
  }
}

async function probeProvider(provider: ProviderName): Promise<void> {
  const adapter = providerRegistry[provider];
  if (!adapter.isConfigured()) {
    const s = state[provider];
    s.status = 'down';
    s.lastCheckedAt = new Date().toISOString();
    s.lastError = undefined;
    s.errorCode = undefined;
    s.statusMessage = 'API key not configured';
    return;
  }

  if (FREE_AUTO_PROVIDERS.includes(provider)) {
    await probeFreeProvider(provider);
    return;
  }

  await probePaidProviderCredentials(provider);
}

export async function refreshProviderHealth(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastRefreshAt < HEALTH_REFRESH_TTL_MS) return;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const providers = Object.keys(providerRegistry) as ProviderName[];
    await Promise.all(providers.map((provider) => probeProvider(provider)));
    lastRefreshAt = Date.now();
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
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
  return s.status === 'healthy' || s.status === 'degraded' || s.status === 'unknown';
}

export { recordFailure, recordSuccess };
