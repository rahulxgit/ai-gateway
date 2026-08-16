import { v4 as uuid } from 'uuid';
import { db } from '../database/client';
import { AnalyticsRecord, ProviderName, TaskType } from '../types';
import { env } from '../config/env';
import { CACHE_KEYS, deleteRedisCache, getRedisCache, setRedisCache } from '../utils/redis-cache';

interface AnalyticsRow {
  id: string;
  session_id: string | null;
  provider: ProviderName;
  model: string;
  task_type: TaskType | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  latency_ms: number;
  success: number;
  error_code: string | null;
  failover_from: ProviderName | null;
  created_at: string;
}

function toRecord(row: AnalyticsRow): AnalyticsRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    provider: row.provider,
    model: row.model,
    taskType: row.task_type,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    estimatedCostUsd: row.estimated_cost_usd,
    latencyMs: row.latency_ms,
    success: Boolean(row.success),
    errorCode: row.error_code,
    failoverFrom: row.failover_from,
    createdAt: row.created_at,
  };
}

export type AnalyticsSummary = ReturnType<typeof computeAnalyticsSummary>;

const ANALYTICS_CACHE_TTL_MS = 5_000;
let cachedSummary: AnalyticsSummary | null = null;
let cachedAt = 0;

export async function invalidateAnalyticsCache(): Promise<void> {
  cachedSummary = null;
  cachedAt = 0;
  // Awaited rather than fire-and-forget: recordAnalytics() calls this right
  // after writing a new row, and a getAnalyticsSummary() call arriving
  // immediately after could otherwise still read a stale L2 Redis value if
  // the delete hadn't completed yet. The in-process L1 cache above is
  // cleared synchronously either way; this only affects the Redis L2 path
  // (CACHE_ENABLED=true), which is best-effort and already tolerant of
  // failures via deleteRedisCache's own try/catch.
  await deleteRedisCache(CACHE_KEYS.analyticsSummary);
}

export async function recordAnalytics(input: {
  sessionId?: string | null;
  provider: ProviderName;
  model: string;
  taskType?: TaskType | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  success: boolean;
  errorCode?: string | null;
  failoverFrom?: ProviderName | null;
}): Promise<void> {
  db.prepare(
    `INSERT INTO analytics
     (id, session_id, provider, model, task_type, prompt_tokens, completion_tokens, total_tokens,
      estimated_cost_usd, latency_ms, success, error_code, failover_from, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uuid(),
    input.sessionId ?? null,
    input.provider,
    input.model,
    input.taskType ?? null,
    input.promptTokens,
    input.completionTokens,
    input.totalTokens,
    input.estimatedCostUsd,
    input.latencyMs,
    input.success ? 1 : 0,
    input.errorCode ?? null,
    input.failoverFrom ?? null,
    new Date().toISOString()
  );

  await invalidateAnalyticsCache();
}

function get24hWindowStart(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

/** Returns the live estimated cost in the same rolling 24h window as analytics. */
export function get24hEstimatedCostUsd(): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(estimated_cost_usd), 0) as totalCostUsd
       FROM analytics
       WHERE created_at >= ?`
    )
    .get(get24hWindowStart()) as { totalCostUsd: number };

  return Number(row.totalCostUsd) || 0;
}

function computeAnalyticsSummary() {
  const windowStart = get24hWindowStart();

  const totals = db
    .prepare(
      `SELECT COUNT(*) as totalRequests,
              COALESCE(SUM(total_tokens),0) as totalTokens,
              COALESCE(SUM(estimated_cost_usd),0) as totalCostUsd,
              COALESCE(AVG(latency_ms),0) as avgLatencyMs,
              COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END),0) as successCount
       FROM analytics
       WHERE created_at >= ?`
    )
    .get(windowStart) as {
    totalRequests: number;
    totalTokens: number;
    totalCostUsd: number;
    avgLatencyMs: number;
    successCount: number;
  };

  const byProvider = db
    .prepare(
      `SELECT provider,
              COUNT(*) as requests,
              COALESCE(SUM(total_tokens),0) as tokens,
              COALESCE(SUM(estimated_cost_usd),0) as costUsd,
              COALESCE(AVG(latency_ms),0) as avgLatencyMs,
              COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END),0) * 1.0 / COUNT(*) as successRate
       FROM analytics WHERE created_at >= ? GROUP BY provider ORDER BY requests DESC`
    )
    .all(windowStart);

  const failovers = db
    .prepare(`SELECT COUNT(*) as count FROM analytics WHERE failover_from IS NOT NULL AND created_at >= ?`)
    .get(windowStart) as { count: number };

  return {
    totalRequests: totals.totalRequests,
    dailyRequests: totals.totalRequests,
    totalTokens: totals.totalTokens,
    estimatedTotalCostUsd: Number(totals.totalCostUsd.toFixed(4)),
    avgLatencyMs: Math.round(totals.avgLatencyMs),
    successRate: totals.totalRequests ? totals.successCount / totals.totalRequests : 1,
    failoverEvents: failovers.count,
    byProvider,
    windowHours: 24,
    windowStart,
  };
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const now = Date.now();
  if (cachedSummary && now - cachedAt < ANALYTICS_CACHE_TTL_MS) {
    return cachedSummary;
  }

  const redisSummary = await getRedisCache(CACHE_KEYS.analyticsSummary);
  if (redisSummary) {
    try {
      const parsed = JSON.parse(redisSummary) as AnalyticsSummary;
      cachedSummary = parsed;
      cachedAt = now;
      return parsed;
    } catch {
      // Ignore malformed shared-cache data and recompute from SQLite.
    }
  }

  const summary = computeAnalyticsSummary();
  cachedSummary = summary;
  cachedAt = now;
  await setRedisCache(CACHE_KEYS.analyticsSummary, JSON.stringify(summary), env.cacheTtlSeconds);
  return summary;
}

export function getRecentAnalytics(limit = 50): AnalyticsRecord[] {
  const rows = db
    .prepare(`SELECT * FROM analytics ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as AnalyticsRow[];
  return rows.map(toRecord);
}
