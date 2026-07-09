import { ProviderName, TaskType } from '../types';

// Default failover order used when no task type is given or a task's
// preferred providers are all unavailable. Order chosen for a mix of
// quality + reliability + generous free tiers.
export const DEFAULT_FAILOVER_ORDER: ProviderName[] = [
  'gemini',
  'anthropic',
  'groq',
  'together',
  'openrouter',
  'openai',
  'huggingface',
];

// Task-based routing preferences. The router tries these providers first,
// in order, before falling back to DEFAULT_FAILOVER_ORDER for anything not
// already tried.
export const TASK_ROUTING: Record<TaskType, ProviderName[]> = {
  coding: ['anthropic', 'gemini', 'openai', 'openrouter'],
  reasoning: ['anthropic', 'openai', 'gemini'],
  creative: ['gemini', 'openai', 'anthropic'],
  fast: ['groq', 'together', 'gemini'],
  cheap: ['together', 'groq', 'openrouter', 'huggingface'],
  'large-context': ['gemini', 'anthropic', 'openai'],
  general: DEFAULT_FAILOVER_ORDER,
};

// Rough per-1K-token USD pricing for cost estimation/analytics. Approximate,
// blended prompt+completion figures — meant for relative cost tracking, not
// billing-grade accuracy. Update as providers change pricing.
export const PRICING_PER_1K_TOKENS: Record<ProviderName, number> = {
  gemini: 0.0007,
  anthropic: 0.006,
  openai: 0.005,
  groq: 0.0002,
  together: 0.0002,
  openrouter: 0.001,
  huggingface: 0.0001,
};

export function buildProviderOrder(
  taskType: TaskType | undefined,
  forceProvider: ProviderName | undefined
): ProviderName[] {
  if (forceProvider) {
    // User forced a provider — try it first, then fall back to the rest of
    // the default chain in case the forced provider is down.
    const rest = DEFAULT_FAILOVER_ORDER.filter((p) => p !== forceProvider);
    return [forceProvider, ...rest];
  }

  const preferred = TASK_ROUTING[taskType ?? 'general'];
  const rest = DEFAULT_FAILOVER_ORDER.filter((p) => !preferred.includes(p));
  return [...preferred, ...rest];
}
