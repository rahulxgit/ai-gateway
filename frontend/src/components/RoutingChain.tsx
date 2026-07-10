import type { ProviderName } from '../types';

const LABELS: Record<ProviderName, string> = {
  gemini: 'gemini',
  anthropic: 'anthropic',
  openai: 'openai',
  groq: 'groq',
  together: 'together',
  openrouter: 'openrouter',
  huggingface: 'huggingface',
};

/**
 * Renders the exact provider chain a response took: every provider tried,
 * with failed hops struck through and faded, and the one that ultimately
 * answered highlighted. This is the whole point of the product made
 * visible — a failover is not hidden, it's shown as a small trail.
 */
export function RoutingChain({
  chain,
  finalProvider,
  model,
  latencyMs,
}: {
  chain: ProviderName[];
  finalProvider: ProviderName;
  model: string;
  latencyMs?: number;
}) {
  const failed = chain.slice(0, -1);
  const switched = chain.length > 1;

  return (
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
      {failed.map((p) => (
        <span key={p} className="flex items-center gap-1">
          <span className="text-ink-faint line-through decoration-danger/70">{LABELS[p]}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" className="text-ink-faint">
            <path d="M1 5h7M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ))}
      <span
        className={
          switched
            ? 'rounded-full bg-signal-dim/40 px-2 py-0.5 text-signal border border-signal-dim'
            : 'rounded-full bg-ok-dim/30 px-2 py-0.5 text-ok border border-ok-dim'
        }
      >
        {LABELS[finalProvider]} · {model}
      </span>
      {switched && (
        <span className="text-signal/80 text-[10px] uppercase tracking-wide">failover</span>
      )}
      {typeof latencyMs === 'number' && (
        <span className="text-ink-faint">{latencyMs}ms</span>
      )}
    </div>
  );
}
