import { ProviderName, TaskType } from '../types';

// Automatic routing is restricted to providers with a documented $0/free
// access path for the selected default model. Trial credits or monthly
// starter credits are not treated as guaranteed free routing capacity.
export const FREE_AUTO_PROVIDERS: ProviderName[] = [
  'gemini',
  'groq',
  'openrouter',
  'cerebras',
  'mistral',
  'cloudflare',
];

export const DEFAULT_FAILOVER_ORDER: ProviderName[] = [
  'gemini',
  'openrouter',
  'groq',
  'cerebras',
  'mistral',
  'cloudflare',
  // These remain supported for explicit/manual use but are never selected
  // automatically because their free access is credit/trial/account-tier dependent.
  'huggingface',
  'nvidia',
  'sambanova',
  'modelscope',
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
  coding: ['groq', 'openrouter', 'mistral', 'gemini', 'cerebras'],
  reasoning: ['openrouter', 'groq', 'gemini', 'cerebras'],
  creative: ['gemini', 'openrouter', 'mistral'],
  fast: ['groq', 'cerebras', 'gemini', 'openrouter'],
  cheap: ['openrouter', 'groq', 'gemini', 'cerebras', 'mistral'],
  'large-context': ['openrouter', 'gemini', 'mistral', 'cerebras'],
  general: FREE_AUTO_PROVIDERS,
};

export const PRICING_PER_1K_TOKENS: Record<ProviderName, number> = {
  gemini: 0,
  anthropic: 0.003,
  openai: 0.0002,
  groq: 0,
  together: 0.0002,
  openrouter: 0,
  huggingface: 0.0001,
  deepseek: 0.00021,
  kimi: 0.0018,
  cerebras: 0,
  mistral: 0,
  cloudflare: 0,
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
    const rest = DEFAULT_FAILOVER_ORDER.filter((p) => p !== forceProvider);
    return [forceProvider, ...rest];
  }

  const preferred = (TASK_ROUTING[taskType ?? 'general'] ?? TASK_ROUTING.general)
    .filter((p) => FREE_AUTO_PROVIDERS.includes(p));
  const rest = FREE_AUTO_PROVIDERS.filter((p) => !preferred.includes(p));
  return [...preferred, ...rest];
}
