import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ProviderHealth } from '../types';

const STATUS_COLOR: Record<ProviderHealth['status'], string> = {
  healthy: 'bg-ok',
  degraded: 'bg-signal',
  rate_limited: 'bg-signal',
  down: 'bg-danger',
  unknown: 'bg-ink-faint',
};

export function HealthBar() {
  const [providers, setProviders] = useState<ProviderHealth[]>([]);

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

  return (
    <div className="flex items-center gap-3 font-mono text-[11px] text-ink-muted">
      {providers.map((p) => (
        <div key={p.provider} className="flex items-center gap-1.5" title={p.lastError ?? p.status}>
          <span
            className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[p.status]} ${
              p.status === 'rate_limited' || p.status === 'degraded' ? 'animate-pulse-dot' : ''
            }`}
          />
          <span>{p.provider}</span>
        </div>
      ))}
    </div>
  );
}
