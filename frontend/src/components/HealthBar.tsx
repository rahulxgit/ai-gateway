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

const STATUS_ORDER: ProviderHealth['status'][] = ['down', 'rate_limited', 'degraded', 'unknown', 'healthy'];

/**
 * Provider health, condensed. Twenty-one inline dots stopped fitting the
 * header once the gateway grew past the original 11 providers — this
 * collapses to a single "N/M healthy" pill, with the full per-provider
 * grid one click away instead of always taking up header width.
 */
export function HealthBar() {
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.getHealth();
        if (!cancelled) setProviders(res.providers);
      } catch {
        // backend unreachable — leave last known state on screen
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
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const healthyCount = providers.filter((p) => p.status === 'healthy').length;
  const worstStatus = useMemo(() => {
    for (const s of STATUS_ORDER) {
      if (providers.some((p) => p.status === s)) return s;
    }
    return 'unknown' as ProviderHealth['status'];
  }, [providers]);

  const sorted = useMemo(
    () =>
      [...providers].sort(
        (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.provider.localeCompare(b.provider)
      ),
    [providers]
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 font-mono text-[12px] text-ink-muted transition hover:border-signal-dim hover:text-ink"
        title="Provider health"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Provider health"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[worstStatus]} ${
            worstStatus === 'rate_limited' || worstStatus === 'degraded' ? 'animate-pulse-dot' : ''
          }`}
        />
        <span>
          {healthyCount}/{providers.length || '·'} healthy
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 max-h-96 w-64 max-w-[90vw] overflow-y-auto scrollbar-thin rounded-md border border-hairline bg-panel p-1.5 shadow-lg">
          {sorted.length === 0 && <p className="px-2 py-1.5 text-[12px] text-ink-faint">No health data yet.</p>}
          {sorted.map((p) => (
            <div
              key={p.provider}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-ink-muted"
              title={p.lastError ?? p.status}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_COLOR[p.status]} ${
                  p.status === 'rate_limited' || p.status === 'degraded' ? 'animate-pulse-dot' : ''
                }`}
              />
              <span className="flex-1 truncate text-ink">{PROVIDER_META[p.provider]?.label ?? p.provider}</span>
              <span className="shrink-0 text-ink-faint">
                {p.status === 'healthy' && p.avgLatencyMs ? `${Math.round(p.avgLatencyMs)}ms` : p.status.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
