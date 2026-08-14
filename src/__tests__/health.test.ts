import { recordFailure, recordSuccess, getHealthSnapshot } from '../services/health.service';

function snapshotFor(provider: string) {
  return getHealthSnapshot().find((h) => h.provider === provider);
}

describe('health.service — status transitions', () => {
  it('marks a provider healthy after a successful inference probe', () => {
    recordSuccess('gemini', 200);
    const snap = snapshotFor('gemini');
    expect(snap?.status).toBe('healthy');
    expect(snap?.statusMessage).toContain('inference succeeded');
  });

  it('marks a provider authentication_failed on AUTH_ERROR', () => {
    recordFailure('kimi', 'AUTH_ERROR', 'kimi: authentication failed');
    const snap = snapshotFor('kimi');
    expect(snap?.status).toBe('authentication_failed');
    expect(snap?.errorCode).toBe('AUTH_ERROR');
    expect(snap?.lastError).toContain('authentication failed');
  });

  it('marks a provider forbidden on FORBIDDEN', () => {
    recordFailure('groq', 'FORBIDDEN', 'groq: access forbidden (provider or network edge denied the request)');
    expect(snapshotFor('groq')?.status).toBe('forbidden');
  });

  it('marks quota exhaustion separately from rate limiting', () => {
    recordFailure('openai', 'QUOTA_EXCEEDED', 'openai: quota exhausted');
    expect(snapshotFor('openai')?.status).toBe('quota_exhausted');

    recordFailure('mistral', 'RATE_LIMITED', 'mistral: rate limited');
    expect(snapshotFor('mistral')?.status).toBe('rate_limited');
  });

  it('marks a model_unavailable state distinctly from authentication failure', () => {
    recordFailure('gemini', 'NOT_FOUND', 'gemini: configured model is unavailable');
    expect(snapshotFor('gemini')?.status).toBe('model_unavailable');
  });

  it('marks account suspension immediately', () => {
    recordSuccess('fireworks', 100);
    recordFailure('fireworks', 'ACCOUNT_SUSPENDED', 'fireworks: account suspended (billing/spending limit)');
    const snap = snapshotFor('fireworks');
    expect(snap?.status).toBe('account_suspended');
    expect(snap?.consecutiveFailures).toBe(1);
  });

  it('marks a provider degraded on a transient failure, down after the threshold', () => {
    recordSuccess('nvidia', 100);
    recordFailure('nvidia', 'SERVER_ERROR', 'nvidia: server error (500)');
    expect(snapshotFor('nvidia')?.status).toBe('degraded');
    recordFailure('nvidia', 'SERVER_ERROR', 'nvidia: server error (500)');
    recordFailure('nvidia', 'SERVER_ERROR', 'nvidia: server error (500)');
    expect(snapshotFor('nvidia')?.status).toBe('down');
  });
});
