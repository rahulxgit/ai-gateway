import { v4 as uuid } from 'uuid';
import { db } from '../database/client';
import { AnalyticsRecord, ProviderName, TaskType } from '../types';

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

export function recordAnalytics(input: {
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
}): void {
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
}

export function getAnalyticsSummary() {
  const totals = db
    .prepare(
      `SELECT COUNT(*) as totalRequests,
              COALESCE(SUM(total_tokens),0) as totalTokens,
              COALESCE(SUM(estimated_cost_usd),0) as totalCostUsd,
              COALESCE(AVG(latency_ms),0) as avgLatencyMs,
              COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END),0) as successCount
       FROM analytics`
    )
    .get() as {
    totalRequests: number;
    totalTokens: number;
    totalCostUsd: number;
    avgLatencyMs: number;
    successCount: number;
  };

  const today = new Date().toISOString().slice(0, 10);
  const daily = db
    .prepare(`SELECT COUNT(*) as count FROM analytics WHERE created_at LIKE ?`)
    .get(`${today}%`) as { count: number };

  const byProvider = db
    .prepare(
      `SELECT provider,
              COUNT(*) as requests,
              COALESCE(SUM(total_tokens),0) as tokens,
              COALESCE(SUM(estimated_cost_usd),0) as costUsd,
              COALESCE(AVG(latency_ms),0) as avgLatencyMs,
              COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END),0) * 1.0 / COUNT(*) as successRate
       FROM analytics GROUP BY provider ORDER BY requests DESC`
    )
    .all();

  const failovers = db
    .prepare(`SELECT COUNT(*) as count FROM analytics WHERE failover_from IS NOT NULL`)
    .get() as { count: number };

  return {
    totalRequests: totals.totalRequests,
    dailyRequests: daily.count,
    totalTokens: totals.totalTokens,
    estimatedTotalCostUsd: Number(totals.totalCostUsd.toFixed(4)),
    avgLatencyMs: Math.round(totals.avgLatencyMs),
    successRate: totals.totalRequests ? totals.successCount / totals.totalRequests : 1,
    failoverEvents: failovers.count,
    byProvider,
  };
}

export function getRecentAnalytics(limit = 50): AnalyticsRecord[] {
  const rows = db
    .prepare(`SELECT * FROM analytics ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as AnalyticsRow[];
  return rows.map(toRecord);
}
