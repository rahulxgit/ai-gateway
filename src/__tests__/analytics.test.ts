import { db, runMigrations } from '../database/client';
import { recordAnalytics, getAnalyticsSummary } from '../services/analytics.service';

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.prepare('DELETE FROM analytics').run();
});

function insertAt(hoursAgo: number, overrides: Partial<Parameters<typeof recordAnalytics>[0]> = {}) {
  recordAnalytics({
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    promptTokens: 10,
    completionTokens: 10,
    totalTokens: 20,
    estimatedCostUsd: 0.001,
    latencyMs: 100,
    success: true,
    ...overrides,
  });
  // recordAnalytics always stamps "now" — backdate it directly in the DB
  // afterwards so we can simulate requests from outside the 24h window.
  const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE analytics SET created_at = ? WHERE id = (SELECT id FROM analytics ORDER BY created_at DESC LIMIT 1)').run(
    createdAt
  );
}

describe('getAnalyticsSummary — rolling 24h window', () => {
  it('includes requests from within the last 24 hours', () => {
    insertAt(1);
    insertAt(23.5);
    const summary = getAnalyticsSummary();
    expect(summary.totalRequests).toBe(2);
    expect(summary.windowHours).toBe(24);
  });

  it('excludes requests older than 24 hours — the window self-resets', () => {
    insertAt(25);
    insertAt(48);
    const summary = getAnalyticsSummary();
    expect(summary.totalRequests).toBe(0);
    expect(summary.byProvider).toHaveLength(0);
  });

  it('mixes in-window and out-of-window requests correctly', () => {
    insertAt(1, { provider: 'anthropic' });
    insertAt(2, { provider: 'anthropic' });
    insertAt(30, { provider: 'anthropic' }); // outside the window, excluded

    const summary = getAnalyticsSummary();
    expect(summary.totalRequests).toBe(2);
    expect(summary.byProvider).toHaveLength(1);
    expect(summary.byProvider[0]).toMatchObject({ provider: 'anthropic', requests: 2 });
  });

  it('dailyRequests mirrors totalRequests now that the whole summary is windowed', () => {
    insertAt(0.5);
    const summary = getAnalyticsSummary();
    expect(summary.dailyRequests).toBe(summary.totalRequests);
  });

  it('only counts failovers that happened within the window', () => {
    insertAt(1, { failoverFrom: 'gemini', provider: 'anthropic' });
    insertAt(26, { failoverFrom: 'gemini', provider: 'anthropic' });
    const summary = getAnalyticsSummary();
    expect(summary.failoverEvents).toBe(1);
  });

  it('returns a successRate of 1 when there are zero requests in the window', () => {
    const summary = getAnalyticsSummary();
    expect(summary.totalRequests).toBe(0);
    expect(summary.successRate).toBe(1);
  });
});
