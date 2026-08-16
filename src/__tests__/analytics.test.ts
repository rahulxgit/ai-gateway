import { db, runMigrations } from '../database/client';
import {
  recordAnalytics,
  getAnalyticsSummary,
  get24hEstimatedCostUsd,
  invalidateAnalyticsCache,
} from '../services/analytics.service';

beforeAll(() => {
  runMigrations();
});

beforeEach(async () => {
  db.prepare('DELETE FROM analytics').run();
  // Rows above are deleted directly via SQL, bypassing recordAnalytics()'s
  // own cache invalidation — the short-TTL analytics cache added for
  // perf reasons has no way to know about that delete, so it must be
  // cleared explicitly here or a prior test's cached summary could leak
  // into this one.
  await invalidateAnalyticsCache();
});

async function insertAt(hoursAgo: number, overrides: Partial<Parameters<typeof recordAnalytics>[0]> = {}) {
  await recordAnalytics({
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
  it('includes requests from within the last 24 hours', async () => {
    await insertAt(1);
    await insertAt(23.5);
    const summary = await getAnalyticsSummary();
    expect(summary.totalRequests).toBe(2);
    expect(summary.windowHours).toBe(24);
  });

  it('excludes requests older than 24 hours — the window self-resets', async () => {
    await insertAt(25);
    await insertAt(48);
    const summary = await getAnalyticsSummary();
    expect(summary.totalRequests).toBe(0);
    expect(summary.byProvider).toHaveLength(0);
  });

  it('mixes in-window and out-of-window requests correctly', async () => {
    await insertAt(1, { provider: 'anthropic' });
    await insertAt(2, { provider: 'anthropic' });
    await insertAt(30, { provider: 'anthropic' }); // outside the window, excluded

    const summary = await getAnalyticsSummary();
    expect(summary.totalRequests).toBe(2);
    expect(summary.byProvider).toHaveLength(1);
    expect(summary.byProvider[0]).toMatchObject({ provider: 'anthropic', requests: 2 });
  });

  it('dailyRequests mirrors totalRequests now that the whole summary is windowed', async () => {
    await insertAt(0.5);
    const summary = await getAnalyticsSummary();
    expect(summary.dailyRequests).toBe(summary.totalRequests);
  });

  it('only counts failovers that happened within the window', async () => {
    await insertAt(1, { failoverFrom: 'gemini', provider: 'anthropic' });
    await insertAt(26, { failoverFrom: 'gemini', provider: 'anthropic' });
    const summary = await getAnalyticsSummary();
    expect(summary.failoverEvents).toBe(1);
  });

  it('returns a successRate of 1 when there are zero requests in the window', async () => {
    const summary = await getAnalyticsSummary();
    expect(summary.totalRequests).toBe(0);
    expect(summary.successRate).toBe(1);
  });
});

describe('get24hEstimatedCostUsd', () => {
  it('uses the same rolling 24-hour window as the analytics summary', async () => {
    await insertAt(1, { estimatedCostUsd: 1.25 });
    await insertAt(23, { estimatedCostUsd: 0.75 });
    await insertAt(25, { estimatedCostUsd: 100 });

    expect(get24hEstimatedCostUsd()).toBeCloseTo(2);
  });
});
