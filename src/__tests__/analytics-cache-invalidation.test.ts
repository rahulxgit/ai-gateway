jest.mock('../utils/redis-cache', () => ({
  ...jest.requireActual('../utils/redis-cache'),
  deleteRedisCache: jest.fn(),
}));

import { db, runMigrations } from '../database/client';
import { deleteRedisCache } from '../utils/redis-cache';
import { recordAnalytics, invalidateAnalyticsCache } from '../services/analytics.service';

const mockedDeleteRedisCache = deleteRedisCache as jest.Mock;

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.prepare('DELETE FROM analytics').run();
  mockedDeleteRedisCache.mockReset();
});

// Regression test for a real race: invalidateAnalyticsCache() used to call
// deleteRedisCache() as fire-and-forget ("void deleteRedisCache(...)"), so
// recordAnalytics() could return before the Redis L2 cache entry was
// actually cleared. A getAnalyticsSummary() call landing in that window
// could read a stale cached summary from Redis even though a new row had
// just been written. Both functions are now async and await the delete,
// closing that window.
describe('analytics cache invalidation — Redis L2 race', () => {
  it('recordAnalytics does not resolve until the Redis cache delete has completed', async () => {
    let deleteResolved = false;
    mockedDeleteRedisCache.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            deleteResolved = true;
            resolve();
          }, 20);
        })
    );

    await recordAnalytics({
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      promptTokens: 10,
      completionTokens: 10,
      totalTokens: 20,
      estimatedCostUsd: 0.001,
      latencyMs: 100,
      success: true,
    });

    // If recordAnalytics were still fire-and-forget, this would be false
    // here — the delayed Redis delete wouldn't have had time to complete.
    expect(deleteResolved).toBe(true);
    expect(mockedDeleteRedisCache).toHaveBeenCalledTimes(1);
  });

  it('invalidateAnalyticsCache awaits the Redis delete before resolving', async () => {
    let deleteResolved = false;
    mockedDeleteRedisCache.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            deleteResolved = true;
            resolve();
          }, 20);
        })
    );

    await invalidateAnalyticsCache();

    expect(deleteResolved).toBe(true);
  });

  it('propagates rejection instead of swallowing it silently if deleteRedisCache throws unexpectedly', async () => {
    // deleteRedisCache itself is documented to swallow Redis errors
    // internally, but this guards against a regression where
    // invalidateAnalyticsCache stops awaiting it and a thrown error would
    // otherwise vanish as an unhandled rejection.
    mockedDeleteRedisCache.mockRejectedValue(new Error('redis unreachable'));

    await expect(invalidateAnalyticsCache()).rejects.toThrow('redis unreachable');
  });
});
