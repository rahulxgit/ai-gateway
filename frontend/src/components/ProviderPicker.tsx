import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_PROVIDERS, PROVIDER_META } from '../types';
import type { ProviderHealth, ProviderName } from '../types';
import { api } from '../lib/api';

const STATUS_DOT: Record<ProviderHealth['status'], string> = {
  healthy: 'bg-ok',
  degraded: 'bg-signal',
  rate_limited: 'bg-signal',
  quota_exhausted: 'bg-signal',
  authentication_failed: 'bg-danger',
  forbidden: 'bg-danger',
  model_unavailable: 'bg-danger',
  account_suspended: 'bg-danger',
  unavailable: 'bg-danger',
  down: 'bg-danger',
  unknown: 'bg-ink-faint',
};

const STATUS_LABEL: Record<ProviderHealth['status'], string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  rate_limited: 'Rate limited',
  quota_exhausted: 'Quota exhausted',
  authentication_failed: 'Authentication failed',
  forbidden: 'Forbidden / edge blocked',
  model_unavailable: 'Model unavailable',
  account_suspended: 'Account suspended',
  unavailable: 'Unavailable',
  down: 'Down',
  unknown: 'Checking',
};

function shouldPulse(status: ProviderHealth['status']): boolean {
  return status === 'degraded' || status === 'rate_limited' || status === 'quota_exhausted';
}

/**
 * Searchable provider combobox. A plain <select> stopped scaling once the
 * gateway grew to 21 providers — this replaces it with a filterable list
 * that surfaces live health status and free/paid tier inline, so picking a
 * provider is a glance instead of scrolling a long native dropdown.
 */
export function ProviderPicker({
  value,
  onChange,
}: {
  value: ProviderName | 'auto';
  onChange: (p: ProviderName | 'auto') => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [health, setHealth] = useState<ProviderHealth[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.getHealth();
        if (!cancelled) setHealth(res.providers);
      } catch {
        // backend unreachable — leave last known state
      }
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const healthByProvider = useMemo(() => {
    const map = new Map<ProviderName, ProviderHealth>();
    for (const h of health) map.set(h.provider, h);
    return map;
  }, [health]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_PROVIDERS;
    return ALL_PROVIDERS.filter((p) => {
      const meta = PROVIDER_META[p];
      return p.toLowerCase().includes(q) || meta.label.toLowerCase().includes(q) || meta.note.toLowerCase().includes(q);
    });
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery('');
  }, [open]);

  const currentLabel = value === 'auto' ? 'auto' : PROVIDER_META[value].label;
  const currentStatus = value !== 'auto' ? healthByProvider.get(value)?.status : undefined;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-hairline bg-panel-raised px-2 py-1 text-ink-muted outline-none transition hover:text-ink focus:border-signal-dim"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select provider"
      >
        {currentStatus && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[currentStatus]} ${
              shouldPulse(currentStatus) ? 'animate-pulse-dot' : ''
            }`}
          />
        )}
        <span>provider: {currentLabel.toLowerCase()}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-0.5 text-ink-faint">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 w-72 max-w-[90vw] overflow-hidden rounded-md border border-hairline bg-panel shadow-lg"
        >
          <div className="border-b border-hairline p-1.5">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search providers…"
              className="w-full rounded bg-panel-raised px-2 py-1 text-[12px] text-ink placeholder:text-ink-faint outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto scrollbar-thin py-1">
            <button
              type="button"
              onClick={() => {
                onChange('auto');
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12px] transition hover:bg-panel-raised ${
                value === 'auto' ? 'text-signal' : 'text-ink-muted'
              }`}
            >
              <span>auto (task-based routing)</span>
              {value === 'auto' && <span>✓</span>}
            </button>
            {filtered.length === 0 && (
              <p className="px-2.5 py-2 text-[12px] text-ink-faint">No providers match “{query}”.</p>
            )}
            {filtered.map((p) => {
              const meta = PROVIDER_META[p];
              const status = healthByProvider.get(p)?.status ?? 'unknown';
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition hover:bg-panel-raised ${
                    value === p ? 'text-signal' : 'text-ink'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]} ${
                      shouldPulse(status) ? 'animate-pulse-dot' : ''
                    }`}
                  />
                  <span className="flex-1 truncate">{meta.label}</span>
                  <span className="shrink-0 text-[9px] text-ink-faint">{STATUS_LABEL[status]}</span>
                  {meta.free && (
                    <span className="shrink-0 rounded border border-ok-dim bg-ok-dim/10 px-1 py-0.5 text-[9px] uppercase tracking-wide text-ok">
                      free
                    </span>
                  )}
                  {value === p && <span className="shrink-0">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
