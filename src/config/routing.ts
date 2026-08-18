import { ProviderName, TaskType } from '../types';

// Free-first automatic routing. Paid/credit-dependent providers remain
// available through explicit forceProvider but are never selected by the
// automatic path. cohere is genuinely free with a recurring (not one-time)
// quota and no billing risk, so it's included here too — placed last since
// its monthly cap (1,000 req/month) is far lower than the other five, so
// it's only reached as a last-resort free fallback rather than being hit
// on every request.
//
// githubmodels is temporarily excluded (2026-08-18): no GITHUB_MODELS_API_KEY
// is set in the production env, so it was silently dead weight in every
// candidate order — live audit confirmed 0/8 requests could ever reach it.
// Re-add once a key is provisioned; FREE_MODEL_IDS entry below is left in
// place so isFreeModel() still classifies it correctly if it's force-used.
export const FREE_AUTO_PROVIDERS: ProviderName[] = [
  'gemini',
  'openrouter',
  'groq',
  'cerebras',
  'mistral',
  'cloudflare',
  'cohere',
];

export const DEFAULT_FAILOVER_ORDER: ProviderName[] = [
  'gemini',
  'openrouter',
  'groq',
  'cerebras',
  'mistral',
  'cloudflare',
  'cohere',
];

export const TASK_ROUTING: Record<TaskType, ProviderName[]> = {
  coding: ['openrouter', 'groq', 'gemini', 'cerebras', 'mistral', 'cloudflare', 'cohere'],
  reasoning: ['openrouter', 'gemini', 'groq', 'cerebras', 'mistral', 'cloudflare', 'cohere'],
  creative: ['gemini', 'openrouter', 'mistral', 'groq', 'cerebras', 'cloudflare', 'cohere'],
  fast: ['groq', 'cerebras', 'gemini', 'openrouter', 'mistral', 'cloudflare', 'cohere'],
  cheap: DEFAULT_FAILOVER_ORDER,
  'large-context': ['gemini', 'openrouter', 'mistral', 'groq', 'cerebras', 'cloudflare', 'cohere'],
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
  githubmodels: ['openai/gpt-4o-mini', 'openai/gpt-4o', 'meta/llama-3.3-70b-instruct'],
  cohere: ['command-r7b-12-2024'],
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
  together: 0.0002,
  openrouter: 0.001,
  huggingface: 0.0001,
  deepseek: 0.00021,
  kimi: 0.0018,
  cerebras: 0.0001,
  mistral: 0.0004,
  cloudflare: 0.0001,
  fireworks: 0.0002,
  inference: 0.0001,
  nebius: 0.0002,
  sambanova: 0.0001,
  nvidia: 0.0002,
  novita: 0.0002,
  baseten: 0.0002,
  modelscope: 0.0001,
  aimlapi: 0.0002,
  // Both genuinely free, recurring-quota providers (daily/monthly reset,
  // no card) — see githubmodels.adapter.ts / cohere.adapter.ts comments.
  // Kept at 0 rather than a nonzero estimate since neither has a paid
  // per-token rate to fall back to on this tier.
  githubmodels: 0,
  cohere: 0,
};

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
