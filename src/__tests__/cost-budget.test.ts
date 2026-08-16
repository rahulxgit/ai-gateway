import { db, runMigrations } from '../database/client';
import { recordAnalytics } from '../services/analytics.service';
import { env } from '../config/env';
import { DailyCostBudgetExceededError, enforceDailyCostBudget } from '../services/orchestrator.service';

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.prepare('DELETE FROM analytics').run();
});

afterEach(() => {
  env.dailyCostBudgetUsd = 0;
});

async function insertCost(estimatedCostUsd: number): Promise<void> {
  await recordAnalytics({
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    promptTokens: 10,
    completionTokens: 10,
    totalTokens: 20,
    estimatedCostUsd,
    latencyMs: 100,
    success: true,
  });
}

describe('daily cost budget guard', () => {
  it('does nothing when the budget is disabled', async () => {
    env.dailyCostBudgetUsd = 0;
    await insertCost(100);

    expect(() => enforceDailyCostBudget()).not.toThrow();
  });

  it('allows requests while the rolling 24h cost is below the budget', async () => {
    env.dailyCostBudgetUsd = 10;
    await insertCost(9.99);

    expect(() => enforceDailyCostBudget()).not.toThrow();
  });

  it('throws a 429 budget error once the rolling 24h cost reaches the budget', async () => {
    env.dailyCostBudgetUsd = 10;
    await insertCost(6);
    await insertCost(4);

    expect(() => enforceDailyCostBudget()).toThrow(DailyCostBudgetExceededError);
    expect(() => enforceDailyCostBudget()).toThrow(
      '24-hour cost budget exceeded: $10.0000 used of $10.0000 allowed.'
    );
  });
});
