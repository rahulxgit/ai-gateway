import { ProviderName, TaskType } from '../types';

// Providers whose documented/free-tier access can be used by automatic routing.
// Paid-only or trial-credit providers remain available through forceProvider but
// are never selected automatically, so the gateway cannot unexpectedly spend money.
export const FREE_AUTO_PROVIDERS: ProviderName[] = [
  'gemini',
  'groq',
  'openrouter',
  'huggingface',
  'cerebras',
  'mistral',
  'cloudflare',
  'nvidia',
  'sambanova',
  'modelscope',
];

export const DEFAULT_FAILOVER_ORDER: ProviderName[] = [
  'gemini',
  'openrouter',
  'groq',
  'cerebras',
  'mistral',
  'cloudflare',
  'nvidia',
  'huggingface',
  'sambanova',
  'modelscope',
  // Paid/trial providers stay after the free pool for explicit/manual use.
  'deepseek',
  'together',
  'anthropic',
  'kimi',
  'fireworks',
  'inference',
  'nebius',
  'novita',
  'baseten',
  'aimlapi',
  'openai',
];

export const TASK_ROUTING: Record<TaskType, ProviderName[]> = {
  coding: ['groq', 'openrouter', 'deepseek', 'mistral', 'gemini'],
  reasoning: ['openrouter', 'groq', 'gemini', 'cerebras'],
  creative: ['gemini', 'openrouter', 'mistral'],
  fast: ['groq', 'cerebras', 'gemini', 'openrouter'],
  cheap: ['openrouter', 'groq', 'gemini', 'cerebras', 'mistral'],
  'large-context': ['openrouter', 'gemini', 'huggingface', 'mistral'],
  general: DEFAULT_FAILOVER_ORDER.filter((provider) => FREE_AUTO_PROVIDERS.includes(provider)),
};

export const PRICING_PER_1K_TOKENS: Record<ProviderName, number> = {
  gemini: 0,
  anthropic: 0.003,
  openai: 0.0002,
  groq: 0,
  together: 0.0002,
  openrouter: 0,
  huggingface: 0,
  deepseek: 0.00021,
  kimi: 0.0018,
  cerebras: 0,
  mistral: 0,
  cloudflare: 0,
  fireworks: 0.0002,
  inference: 0.0001,
  nebius: 0.0002,
  sambanova: 0,
  nvidia: 0,
  novita: 0.0002,
  baseten: 0.0002,
  modelscope: 0,
  aimlapi: 0.0002,
};

export function buildProviderOrder(
  taskType: TaskType | undefined,
  forceProvider: ProviderName | undefined
): ProviderName[] {
  if (forceProvider) {
    const rest = DEFAULT_FAILOVER_ORDER.filter((p) => p !== forceProvider);
    return [forceProvider, ...rest];
  }

  const preferred = (TASK_ROUTING[taskType ?? 'general'] ?? TASK_ROUTING.general)
    .filter((p) => FREE_AUTO_PROVIDERS.includes(p));
  const rest = DEFAULT_FAILOVER_ORDER.filter(
    (p) => FREE_AUTO_PROVIDERS.includes(p) && !preferred.includes(p)
  );
  return [...preferred, ...rest];
}
