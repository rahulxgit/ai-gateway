import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { PROVIDER_META } from '../types';
import type { ProviderHealth } from '../types';

const STATUS_COLOR: Record<ProviderHealth['status'], string> = {
  healthy: 'bg-ok',
  degraded: 'bg-signal',
  rate_limited: 'bg-signal',
  down: 'bg-danger',
  unknown: 'bg-ink-faint',
};

const STATUS_LABEL: Record<ProviderHealth['status'], string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  rate_limited: 'Rate limited',
  down: 'Down',
  unknown: 'Unknown',
};

const STATUS_ORDER: ProviderHealth['status'][] = ['down', 'rate_limited', 'degraded', 'unknown', 'healthy'];

export function HealthBar() {
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await api.getHealth();
        if (!cancelled) setProviders(response.providers);
      } catch {
        // Keep the last known state if the health endpoint is temporarily unavailable.
      }
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const healthyCount = providers.filter((provider) => provider.status === 'healthy').length;
  const worstStatus = useMemo(() => {
    for (const status of STATUS_ORDER) {
      if (providers.some((provider) => provider.status === status)) return status;
    }
    return 'unknown' as ProviderHealth['status'];
  }, [providers]);

  const sorted = useMemo(
    () => [...providers].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.provider.localeCompare(b.provider)),
    [providers]
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg border border-hairline bg-panel/70 px-2.5 py-1.5 font-mono text-[11px] text-ink-muted transition hover:border-signal-dim hover:bg-panel hover:text-ink"
        title="Open provider health"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Provider health"
      >
        <span className="relative flex h-2 w-2 items-center justify-center">
          {(worstStatus === 'rate_limited' || worstStatus === 'degraded') && <span className="absolute h-2 w-2 animate-ping rounded-full bg-signal/30" />}
          <span className={`relative h-1.5 w-1.5 rounded-full ${STATUS_COLOR[worstStatus]}`} />
        </span>
        <span>{providers.length ? `${healthyCount}/${providers.length} healthy` : 'Checking health…'}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-hairline bg-panel shadow-2xl" role="dialog" aria-label="Provider health details">
          <div className="border-b border-hairline/80 bg-panel-raised/40 px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Provider health</p>
                <p className="mt-0.5 text-[11px] text-ink-faint">Updated every 8 seconds</p>
              </div>
              <span className="rounded-full border border-hairline px-2 py-1 font-mono text-[10px] text-ink-faint">
                {STATUS_LABEL[worstStatus]}
              </span>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5 scrollbar-thin">
            {sorted.length === 0 && <p className="px-3 py-4 text-xs text-ink-faint">No provider health data yet.</p>}
            {sorted.map((provider) => (
              <div key={provider.provider} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition hover:bg-panel-raised/70" title={provider.lastError ?? provider.status}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_COLOR[provider.status]}`} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                  {PROVIDER_META[provider.provider]?.label ?? provider.provider}
                </span>
                <span className="shrink-0 text-[10px] text-ink-faint">
                  {provider.status === 'healthy' && provider.avgLatencyMs ? `${Math.round(provider.avgLatencyMs)}ms` : STATUS_LABEL[provider.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
