import { ProviderName, TaskType } from '../types';

// Free-first automatic routing. Paid/credit-dependent providers remain
// available through explicit forceProvider but are never selected by the
// automatic path. cohere is genuinely free with a recurring (not one-time)
// quota and no billing risk, so it's included here too — placed last since
// its monthly cap (1,000 req/month) is far lower than the other five, so
// it's only reached as a last-resort free fallback rather than being hit
// on every request.
export const FREE_AUTO_PROVIDERS: ProviderName[] = [
  'gemini',
  'openrouter',
  'groq',
  'cerebras',
  'mistral',
  'cloudflare',
  'cohere',
  // Confirmed free (build.nvidia.com model card, checked 2026-08-19). Cold
  // starts can be slow (see nvidia.adapter.ts's 90s requestTimeoutMs) so
  // it's placed last-ish in practice via DEFAULT_FAILOVER_ORDER rather than
  // being a first-choice free provider.
  'nvidia',
];

export const DEFAULT_FAILOVER_ORDER: ProviderName[] = [
  'gemini',
  'openrouter',
  'groq',
  'cerebras',
  'mistral',
  'cloudflare',
  'cohere',
  // Last: confirmed-free but slow cold starts (see FREE_AUTO_PROVIDERS
  // comment above) make it a poor first pick for automatic failover.
  'nvidia',
];

export const TASK_ROUTING: Record<TaskType, ProviderName[]> = {
  coding: ['openrouter', 'groq', 'gemini', 'cerebras', 'mistral', 'cloudflare', 'cohere', 'nvidia'],
  reasoning: ['openrouter', 'gemini', 'groq', 'cerebras', 'mistral', 'cloudflare', 'cohere', 'nvidia'],
  creative: ['gemini', 'openrouter', 'mistral', 'groq', 'cerebras', 'cloudflare', 'cohere', 'nvidia'],
  fast: ['groq', 'cerebras', 'gemini', 'openrouter', 'mistral', 'cloudflare', 'cohere', 'nvidia'],
  cheap: DEFAULT_FAILOVER_ORDER,
  'large-context': ['gemini', 'openrouter', 'mistral', 'groq', 'cerebras', 'cloudflare', 'cohere', 'nvidia'],
  general: DEFAULT_FAILOVER_ORDER,
};

// Only these exact defaults are guaranteed to be part of the gateway's
// automatic free pool. OpenRouter's :free suffix is also always $0.
// Keeping this model-aware prevents a forced paid model from being reported
// as free merely because its provider has a free default.
export const FREE_MODEL_IDS: Partial<Record<ProviderName, string[]>> = {
  gemini: ['gemini-3.1-flash-lite'],
  openrouter: ['openrouter/free'],
  groq: ['qwen/qwen3.6-27b'],
  cerebras: ['gpt-oss-120b'],
  mistral: ['mistral-small-latest'],
  cloudflare: ['@cf/google/gemma-4-26b-a4b-it'],
  cohere: ['command-r7b-12-2024'],
  nvidia: ['nvidia/nemotron-3.5-lightning-30b-a3b'],
};

export function isFreeModel(provider: ProviderName, model: string): boolean {
  if (model.endsWith(':free')) return true;
  return FREE_MODEL_IDS[provider]?.includes(model) ?? false;
}

// Provider-level price estimates remain only for models that are not in the
// explicit free-model set. They are approximate analytics values, not billing.
export const PRICING_PER_1K_TOKENS: Record<ProviderName, number> = {
  gemini: 0.003,
  anthropic: 0.003,
  openai: 0.0002,
  groq: 0.0002,
  openrouter: 0.001,
  huggingface: 0.0001,
  cerebras: 0.0001,
  mistral: 0.0004,
  cloudflare: 0.0001,
  fireworks: 0.0002,
  nvidia: 0,
  novita: 0.0002,
  baseten: 0.0002,
  // Genuinely free, recurring-quota provider (monthly reset, no card) —
  // see cohere.adapter.ts comments. Kept at 0 rather than a nonzero
  // estimate since it has no paid per-token rate to fall back to.
  cohere: 0,
};

// Everything NOT in FREE_AUTO_PROVIDERS, ordered cheapest-per-1k-token
// first. Only reachable when a caller explicitly opts out of free-only
// routing (ChatRequest.freeOnly === false) — see buildAutoProviderOrder.
export const PAID_AUTO_PROVIDERS: ProviderName[] = (
  Object.keys(PRICING_PER_1K_TOKENS) as ProviderName[]
)
  .filter((p) => !FREE_AUTO_PROVIDERS.includes(p))
  .sort((a, b) => PRICING_PER_1K_TOKENS[a] - PRICING_PER_1K_TOKENS[b]);

export function buildProviderOrder(
  taskType: TaskType | undefined,
  forceProvider: ProviderName | undefined
): ProviderName[] {
  // "forceProvider" means exactly one provider. Any failure is surfaced to
  // the caller rather than silently switching to a different provider.
  if (forceProvider) return [forceProvider];

  const preferred = TASK_ROUTING[taskType ?? 'general'];
  return Array.from(new Set(preferred));
}

// Mode-aware version of buildProviderOrder for automatic (non-forced)
// routing. freeOnly defaults to true so existing callers/behavior are
// unaffected; passing false appends the paid pool as a fallback tier
// after every free provider has been tried, rather than replacing it.
export function buildAutoProviderOrder(
  taskType: TaskType | undefined,
  freeOnly: boolean | undefined
): ProviderName[] {
  const free = Array.from(new Set(TASK_ROUTING[taskType ?? 'general']));
  if (freeOnly !== false) return free;
  return Array.from(new Set([...free, ...PAID_AUTO_PROVIDERS]));
}
