import { ProviderName, TaskType } from '../types';

// Free-first automatic routing. Paid/credit-dependent providers remain
// available through explicit forceProvider but are not part of automatic
// failover, so a quota problem in a free provider cannot silently turn into
// paid inference.
export const FREE_AUTO_PROVIDERS: ProviderName[] = [
  'gemini',
  'groq',
  'openrouter',
  'cerebras',
  'mistral',
  'cloudflare',
];

// OpenRouter is placed immediately after the direct high-capacity free
// providers because openrouter/free dynamically distributes work across its
// currently available free model pool. This complements, rather than
// replaces, independent provider quotas.
export const DEFAULT_FAILOVER_ORDER: ProviderName[] = [
  'gemini',
  'openrouter',
  'groq',
  'cerebras',
  'mistral',
  'cloudflare',
];

export const TASK_ROUTING: Record<TaskType, ProviderName[]> = {
  coding: ['openrouter', 'groq', 'gemini', 'cerebras', 'mistral', 'cloudflare'],
  reasoning: ['openrouter', 'gemini', 'groq', 'cerebras', 'mistral', 'cloudflare'],
  creative: ['gemini', 'openrouter', 'mistral', 'groq', 'cerebras', 'cloudflare'],
  fast: ['groq', 'cerebras', 'gemini', 'openrouter', 'mistral', 'cloudflare'],
  cheap: DEFAULT_FAILOVER_ORDER,
  'large-context': ['gemini', 'openrouter', 'mistral', 'groq', 'cerebras', 'cloudflare'],
  general: DEFAULT_FAILOVER_ORDER,
};

// These values are only used for relative analytics. Automatically routed
// providers in FREE_AUTO_PROVIDERS must report $0 to make the free-only
// policy visible in the gateway UI/analytics.
export const PRICING_PER_1K_TOKENS: Record<ProviderName, number> = {
  gemini: 0.0,
  anthropic: 0.003,
  openai: 0.0002,
  groq: 0.0,
  together: 0.0002,
  openrouter: 0.0,
  huggingface: 0.0001,
  deepseek: 0.00021,
  kimi: 0.0018,
  cerebras: 0.0,
  mistral: 0.0,
  cloudflare: 0.0,
  fireworks: 0.0002,
  inference: 0.0001,
  nebius: 0.0002,
  sambanova: 0.0001,
  nvidia: 0.0002,
  novita: 0.0002,
  baseten: 0.0002,
  modelscope: 0.0001,
  aimlapi: 0.0002,
};

export function buildProviderOrder(
  taskType: TaskType | undefined,
  forceProvider: ProviderName | undefined
): ProviderName[] {
  if (forceProvider) {
    const rest = Object.values(TASK_ROUTING)
      .flat()
      .filter((p) => p !== forceProvider);
    return [forceProvider, ...Array.from(new Set(rest))];
  }

  const preferred = TASK_ROUTING[taskType ?? 'general'];
  return Array.from(new Set(preferred));
}
