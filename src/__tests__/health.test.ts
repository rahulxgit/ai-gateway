import { recordFailure, recordSuccess, getHealthSnapshot } from '../services/health.service';

function snapshotFor(provider: string) {
  return getHealthSnapshot().find((h) => h.provider === provider);
}

describe('health.service — status transitions', () => {
  it('marks a provider healthy after a success', () => {
    recordSuccess('gemini', 200);
    expect(snapshotFor('gemini')?.status).toBe('healthy');
  });

  it('marks a provider rate_limited on RATE_LIMITED/QUOTA_EXCEEDED', () => {
    recordFailure('groq', 'RATE_LIMITED', 'groq: rate limited');
    expect(snapshotFor('groq')?.status).toBe('rate_limited');
  });

  // Regression: ACCOUNT_SUSPENDED (e.g. Fireworks HTTP 412 billing
  // suspension) used to fall through the generic "degraded, then down
  // after 3 failures" path — meaning a suspended account still looked
  // healthy-ish in the UI for a couple of requests. It should read as
  // down immediately, since it won't self-resolve by retrying.
  it('marks a provider down immediately on ACCOUNT_SUSPENDED, without waiting for repeated failures', () => {
    recordSuccess('fireworks', 100); // starts healthy
    recordFailure('fireworks', 'ACCOUNT_SUSPENDED', 'fireworks: account suspended (billing/spending limit)');
    const snap = snapshotFor('fireworks');
    expect(snap?.status).toBe('down');
    expect(snap?.consecutiveFailures).toBe(1);
    expect(snap?.lastError).toContain('suspended');
  });

  it('marks a provider degraded on a single generic failure, down after the threshold', () => {
    recordSuccess('mistral', 100);
    recordFailure('mistral', 'SERVER_ERROR', 'mistral: server error (500)');
    expect(snapshotFor('mistral')?.status).toBe('degraded');
    recordFailure('mistral', 'SERVER_ERROR', 'mistral: server error (500)');
    recordFailure('mistral', 'SERVER_ERROR', 'mistral: server error (500)');
    expect(snapshotFor('mistral')?.status).toBe('down');
  });
});
