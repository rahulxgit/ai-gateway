import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { PROVIDER_META } from '../types';
import type { AnalyticsSummary, ProviderHealth } from '../types';

const STATUS_COLOR: Record<ProviderHealth['status'], string> = {
  healthy: 'bg-ok',
  configured: 'bg-ink-faint',
  degraded: 'bg-signal',
  rate_limited: 'bg-signal',
  auth_error: 'bg-danger',
  billing_required: 'bg-danger',
  model_unavailable: 'bg-danger',
  retired: 'bg-danger',
  unknown: 'bg-ink-faint',
};

const STATUS_LABEL: Record<ProviderHealth['status'], string> = {
  healthy: 'Healthy',
  configured: 'Configured',
  degraded: 'Degraded',
  rate_limited: 'Rate limited',
  auth_error: 'Auth error',
  billing_required: 'Billing required',
  model_unavailable: 'Model unavailable',
  retired: 'Retired',
  unknown: 'Unknown',
};

// Worst-first for sorting. "configured" (never checked yet) and "unknown"
// (not configured at all) sit in the middle — neither a confirmed problem
// nor a confirmed success.
const STATUS_ORDER: ProviderHealth['status'][] = [
  'auth_error',
  'billing_required',
  'model_unavailable',
  'retired',
  'rate_limited',
  'degraded',
  'configured',
  'unknown',
  'healthy',
];

export function AnalyticsPanel({ onClose }: { onClose: () => void }) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<ProviderHealth[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .getAnalytics()
        .then((res) => {
          if (!cancelled) setSummary(res.summary);
        })
        .catch(() => {
          if (!cancelled) setSummary(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    // Refresh periodically — the window is rolling, so the numbers shift
    // on their own as old requests age out, even with the panel left open.
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Health polling only runs while this panel is mounted, unlike the old
  // always-on header widget that polled every 8s for the entire session
  // regardless of whether anyone ever looked at it. Same 8s cadence, but
  // now it only costs anything while the person actually has this panel
  // open — a real reduction in background work for the common case.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api
        .getHealth()
        .then((res) => {
          if (!cancelled) setHealth(res.providers);
        })
        .catch(() => {
          // Keep the last known reading if the endpoint is momentarily unreachable.
        });
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const windowHours = summary?.windowHours ?? 24;
  const maxRequests = summary ? Math.max(1, ...summary.byProvider.map((p) => p.requests)) : 1;

  const sortedHealth = useMemo(
    () =>
      [...health].sort(
        (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.provider.localeCompare(b.provider)
      ),
    [health]
  );
  const healthyCount = health.filter((p) => p.status === 'healthy').length;

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-full overflow-y-auto scrollbar-thin border-l border-hairline bg-panel p-3.5 sm:w-96 sm:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-mono text-sm uppercase tracking-wide text-ink-muted">Analytics</h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink">✕</button>
        </div>
        <p className="mb-4 font-mono text-[10px] text-ink-faint">
          Rolling {windowHours}h window — resets continuously as older requests age out, no manual reset needed.
        </p>

        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-mono text-[12px] uppercase tracking-wide text-ink-faint">Provider health</h3>
            <span className="font-mono text-[10px] text-ink-faint">
              {health.length ? `${healthyCount}/${health.length} healthy` : 'checking…'}
            </span>
          </div>
          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-hairline bg-panel-raised/40 p-1 scrollbar-thin">
            {sortedHealth.length === 0 && <p className="px-2 py-3 text-xs text-ink-faint">No provider health data yet.</p>}
            {sortedHealth.map((p) => (
              <div
                key={p.provider}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-panel-raised/70"
                title={p.lastError ?? STATUS_LABEL[p.status]}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_COLOR[p.status]}`} />
                <span className="min-w-0 flex-1 truncate text-xs text-ink">
                  {PROVIDER_META[p.provider]?.label ?? p.provider}
                </span>
                <span className="shrink-0 text-[10px] text-ink-faint">
                  {p.status === 'healthy' && p.avgLatencyMs ? `${Math.round(p.avgLatencyMs)}ms` : STATUS_LABEL[p.status]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {loading && <p className="text-sm text-ink-faint">Loading…</p>}
        {!loading && !summary && <p className="text-sm text-ink-faint">Couldn't reach the analytics endpoint.</p>}
        {!loading && summary && summary.totalRequests === 0 && (
          <p className="text-sm text-ink-faint">No requests in the last {windowHours}h.</p>
        )}

        {summary && summary.totalRequests > 0 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2.5">
              <Stat label={`Requests (${windowHours}h)`} value={summary.totalRequests} />
              <Stat
                label="Success rate"
                value={`${Math.round(summary.successRate * 100)}%`}
                tone={summary.successRate < 0.9 ? 'danger' : 'ok'}
              />
              <Stat label="Failovers" value={summary.failoverEvents} tone={summary.failoverEvents > 0 ? 'signal' : undefined} />
              <Stat label="Avg latency" value={`${summary.avgLatencyMs}ms`} />
              <Stat label="Tokens" value={summary.totalTokens.toLocaleString()} />
              <Stat label="Est. cost" value={`$${summary.estimatedTotalCostUsd.toFixed(4)}`} />
            </div>

            <div>
              <h3 className="mb-2 font-mono text-[12px] uppercase tracking-wide text-ink-faint">
                By provider — last {windowHours}h
              </h3>
              <div className="space-y-1.5">
                {summary.byProvider.map((p) => {
                  const meta = PROVIDER_META[p.provider];
                  const pct = Math.round((p.requests / maxRequests) * 100);
                  return (
                    <div key={p.provider} className="rounded-md border border-hairline bg-panel-raised px-3 py-2">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="truncate font-mono text-ink">{meta?.label ?? p.provider}</span>
                        <span
                          className={`shrink-0 font-mono ${p.successRate < 0.9 ? 'text-danger' : 'text-ok'}`}
                        >
                          {Math.round(p.successRate * 100)}%
                        </span>
                      </div>
                      <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-hairline">
                        <div className="h-full rounded-full bg-signal-dim" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between font-mono text-[10px] text-ink-faint">
                        <span>{p.requests} req</span>
                        <span>{Math.round(p.avgLatencyMs)}ms avg</span>
                        <span>${p.costUsd.toFixed(4)}</span>
                      </div>
                    </div>
                  );
                })}
                {summary.byProvider.length === 0 && (
                  <p className="text-xs text-ink-faint">No provider activity in this window.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'signal' | 'ok' | 'danger';
}) {
  const toneClass =
    tone === 'signal' ? 'text-signal' : tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div className="rounded-md border border-hairline bg-panel-raised p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mt-1 font-mono text-lg ${toneClass}`}>{value}</div>
    </div>
  );
}
