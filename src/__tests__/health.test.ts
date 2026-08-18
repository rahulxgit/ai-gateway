import { isLikelyHealthy, recordFailure, recordSuccess, getHealthSnapshot } from '../services/health.service';

function snapshotFor(provider: string) {
  return getHealthSnapshot().find((h) => h.provider === provider);
}

describe('health.service — status transitions', () => {
  it('marks a provider healthy after a success', () => {
    recordSuccess('gemini', 200);
    expect(snapshotFor('gemini')?.status).toBe('healthy');
    expect(isLikelyHealthy('gemini')).toBe(true);
  });

  it('marks a provider rate_limited on RATE_LIMITED/QUOTA_EXCEEDED', () => {
    recordFailure('groq', 'RATE_LIMITED', 'groq: rate limited');
    expect(snapshotFor('groq')?.status).toBe('rate_limited');
    expect(isLikelyHealthy('groq')).toBe(false);
  });

  // Regression: ACCOUNT_SUSPENDED (e.g. Fireworks HTTP 412 billing
  // suspension) used to fall through the generic "degraded, then down
  // after 3 failures" path — meaning a suspended account still looked
  // healthy-ish in the UI for a couple of requests. It should read as
  // billing_required immediately and remain protected by a recovery
  // cooldown.
  it('marks a provider billing_required immediately on ACCOUNT_SUSPENDED, without waiting for repeated failures', () => {
    recordSuccess('fireworks', 100);
    recordFailure('fireworks', 'ACCOUNT_SUSPENDED', 'fireworks: account suspended (billing/spending limit)');
    const snap = snapshotFor('fireworks');
    expect(snap?.status).toBe('billing_required');
    expect(snap?.consecutiveFailures).toBe(1);
    expect(snap?.lastError).toContain('suspended');
    expect(isLikelyHealthy('fireworks')).toBe(false);
  });

  it('marks a provider billing_required immediately on INSUFFICIENT_CREDITS, without waiting for repeated failures', () => {
    recordSuccess('anthropic', 100);
    recordFailure('anthropic', 'INSUFFICIENT_CREDITS', 'anthropic: Your credit balance is too low');
    const snap = snapshotFor('anthropic');
    expect(snap?.status).toBe('billing_required');
    expect(snap?.consecutiveFailures).toBe(1);
    expect(isLikelyHealthy('anthropic')).toBe(false);
  });

  it('marks a provider auth_error immediately on AUTH_ERROR, without waiting for repeated failures', () => {
    recordSuccess('mistral', 100);
    recordFailure('mistral', 'AUTH_ERROR', 'mistral: authentication failed');
    const snap = snapshotFor('mistral');
    expect(snap?.status).toBe('auth_error');
    expect(isLikelyHealthy('mistral')).toBe(false);
  });

  it('marks a provider model_unavailable on NOT_FOUND', () => {
    recordSuccess('cohere', 100);
    recordFailure('cohere', 'NOT_FOUND', 'cohere: default model not present in live /models list');
    const snap = snapshotFor('cohere');
    expect(snap?.status).toBe('model_unavailable');
    expect(isLikelyHealthy('cohere')).toBe(false);
  });

  it('marks a provider retired on UNAVAILABLE (unreachable endpoint)', () => {
    recordSuccess('openrouter', 100);
    recordFailure('openrouter', 'UNAVAILABLE', 'openrouter: unreachable');
    const snap = snapshotFor('openrouter');
    expect(snap?.status).toBe('retired');
    expect(isLikelyHealthy('openrouter')).toBe(false);
  });

  it('keeps degraded providers eligible as fallback candidates', () => {
    recordSuccess('groq', 100);
    recordFailure('groq', 'SERVER_ERROR', 'groq: server error (500)');
    expect(snapshotFor('groq')?.status).toBe('degraded');
    expect(isLikelyHealthy('groq')).toBe(true);
  });

  it('escalates repeated transient failures (SERVER_ERROR/TIMEOUT/UNKNOWN) to retired after 3 consecutive failures', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      recordSuccess('cerebras', 100);
      recordFailure('cerebras', 'SERVER_ERROR', 'cerebras: server error (500)');
      recordFailure('cerebras', 'SERVER_ERROR', 'cerebras: server error (500)');
      expect(snapshotFor('cerebras')?.status).toBe('degraded');
      expect(isLikelyHealthy('cerebras')).toBe(true);

      recordFailure('cerebras', 'SERVER_ERROR', 'cerebras: server error (500)');
      expect(snapshotFor('cerebras')?.status).toBe('retired');
      expect(isLikelyHealthy('cerebras')).toBe(false);

      nowSpy.mockReturnValue(1_000_000 + 10 * 60_000 + 1);
      expect(isLikelyHealthy('cerebras')).toBe(true);
      expect(snapshotFor('cerebras')?.status).toBe('unknown');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('reports lastCheckSource so probe-driven and traffic-driven readings are distinguishable', () => {
    recordSuccess('gemini', 100, undefined, 'probe');
    expect(snapshotFor('gemini')?.lastCheckSource).toBe('probe');
    recordSuccess('gemini', 100, undefined, 'traffic');
    expect(snapshotFor('gemini')?.lastCheckSource).toBe('traffic');
    // Defaults to 'traffic' when the caller doesn't specify — matches
    // router.service.ts's real call sites, which never pass a 4th arg.
    recordSuccess('gemini', 100);
    expect(snapshotFor('gemini')?.lastCheckSource).toBe('traffic');
  });

  it('seeds an unconfigured provider as unknown, never touched by a check', () => {
    // No real API keys exist in the test environment (env.ts skips loading
    // .env when NODE_ENV=test), so every provider's isConfigured() is
    // false here — 'baseten' isn't exercised by any other test in this
    // file, so its status should still be exactly the initial seed value.
    const baseten = snapshotFor('baseten');
    expect(baseten?.status).toBe('unknown');
    expect(baseten?.consecutiveFailures).toBe(0);
  });
});
