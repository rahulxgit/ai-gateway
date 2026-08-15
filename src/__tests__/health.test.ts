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
  // down immediately and remain protected by a recovery cooldown.
  it('marks a provider down immediately on ACCOUNT_SUSPENDED, without waiting for repeated failures', () => {
    recordSuccess('fireworks', 100);
    recordFailure('fireworks', 'ACCOUNT_SUSPENDED', 'fireworks: account suspended (billing/spending limit)');
    const snap = snapshotFor('fireworks');
    expect(snap?.status).toBe('down');
    expect(snap?.consecutiveFailures).toBe(1);
    expect(snap?.lastError).toContain('suspended');
    expect(isLikelyHealthy('fireworks')).toBe(false);
  });

  it('marks a provider down immediately on INSUFFICIENT_CREDITS, without waiting for repeated failures', () => {
    recordSuccess('anthropic', 100);
    recordFailure('anthropic', 'INSUFFICIENT_CREDITS', 'anthropic: Your credit balance is too low');
    const snap = snapshotFor('anthropic');
    expect(snap?.status).toBe('down');
    expect(snap?.consecutiveFailures).toBe(1);
    expect(isLikelyHealthy('anthropic')).toBe(false);
  });

  it('keeps degraded providers eligible as fallback candidates', () => {
    recordSuccess('mistral', 100);
    recordFailure('mistral', 'SERVER_ERROR', 'mistral: server error (500)');
    expect(snapshotFor('mistral')?.status).toBe('degraded');
    expect(isLikelyHealthy('mistral')).toBe(true);
  });

  it('recovers a provider after the temporary down recovery cooldown', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      recordSuccess('cerebras', 100);
      recordFailure('cerebras', 'SERVER_ERROR', 'cerebras: server error (500)');
      recordFailure('cerebras', 'SERVER_ERROR', 'cerebras: server error (500)');
      recordFailure('cerebras', 'SERVER_ERROR', 'cerebras: server error (500)');
      expect(snapshotFor('cerebras')?.status).toBe('down');
      expect(isLikelyHealthy('cerebras')).toBe(false);

      nowSpy.mockReturnValue(1_000_000 + 10 * 60_000 + 1);
      expect(isLikelyHealthy('cerebras')).toBe(true);
      expect(snapshotFor('cerebras')?.status).toBe('unknown');
    } finally {
      nowSpy.mockRestore();
    }
  });
});
