import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AnalyticsSummary } from '../types';

export function AnalyticsPanel({ onClose }: { onClose: () => void }) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    api.getAnalytics().then((res) => setSummary(res.summary)).catch(() => setSummary(null));
  }, []);

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-96 overflow-y-auto scrollbar-thin border-l border-hairline bg-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-mono text-sm uppercase tracking-wide text-ink-muted">Analytics</h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink">✕</button>
        </div>

        {!summary && <p className="text-sm text-ink-faint">No requests yet.</p>}

        {summary && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total requests" value={summary.totalRequests} />
              <Stat label="Today" value={summary.dailyRequests} />
              <Stat label="Success rate" value={`${Math.round(summary.successRate * 100)}%`} />
              <Stat label="Failovers" value={summary.failoverEvents} accent />
              <Stat label="Avg latency" value={`${summary.avgLatencyMs}ms`} />
              <Stat label="Est. cost" value={`$${summary.estimatedTotalCostUsd.toFixed(4)}`} />
            </div>

            <div>
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
                By provider
              </h3>
              <div className="space-y-2">
                {summary.byProvider.map((p) => (
                  <div
                    key={p.provider}
                    className="flex items-center justify-between rounded-md border border-hairline bg-panel-raised px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-ink">{p.provider}</span>
                    <span className="text-ink-faint">{p.requests} reqs</span>
                    <span className="text-ink-faint">{Math.round(p.avgLatencyMs)}ms</span>
                    <span className="text-ok">{Math.round(p.successRate * 100)}%</span>
                  </div>
                ))}
                {summary.byProvider.length === 0 && (
                  <p className="text-xs text-ink-faint">No provider activity yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-md border border-hairline bg-panel-raised p-3">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mt-1 font-mono text-lg ${accent ? 'text-signal' : 'text-ink'}`}>{value}</div>
    </div>
  );
}
