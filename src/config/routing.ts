import { ProviderName, TaskType } from '../types';

// Default failover order used when no task type is given or a task's
// preferred providers are all unavailable. Gemini leads the general lane
// because its current GA Flash-Lite model is available in the Gemini API's
// free tier and is designed for high-volume, lightweight workloads.
export const DEFAULT_FAILOVER_ORDER: ProviderName[] = [
  'gemini',
  'anthropic',
  'deepseek',
  'cerebras',
  'groq',
  'mistral',
  'kimi',
  'together',
  'openrouter',
  'openai',
  'huggingface',
  // Newly added free/free-tier providers. Appended at the end of the
  // default chain (rather than interleaved) so existing routing behavior
  // and task preferences for all previously-supported providers are
  // completely unchanged; these only get tried after the original list.
  'nebius',
  'fireworks',
  'sambanova',
  'novita',
  'nvidia',
  'cloudflare',
  'aimlapi',
  'baseten',
  'modelscope',
  'inference',
];

// Task-based routing preferences. The router tries these providers first,
// in order, before falling back to DEFAULT_FAILOVER_ORDER for anything not
// already tried.
export const TASK_ROUTING: Record<TaskType, ProviderName[]> = {
  coding: ['deepseek', 'anthropic', 'mistral', 'kimi', 'gemini', 'openai', 'openrouter'],
  reasoning: ['deepseek', 'anthropic', 'openai', 'gemini'],
  creative: ['gemini', 'openai', 'anthropic'],
  fast: ['cerebras', 'groq', 'together', 'gemini'],
  cheap: ['gemini', 'deepseek', 'cerebras', 'together', 'groq', 'openrouter', 'huggingface'],
  'large-context': ['kimi', 'gemini', 'anthropic', 'openai'],
  general: DEFAULT_FAILOVER_ORDER,
};

// Rough per-1K-token USD pricing for cost estimation/analytics. Approximate,
// blended prompt+completion figures — meant for relative cost tracking, not
// billing-grade accuracy. Gemini's free-tier pricing is zero for supported
// free-tier usage, but actual rate limits are dynamic and must not be encoded
// here; Google exposes the active RPM/TPM/RPD limits in AI Studio.
export const PRICING_PER_1K_TOKENS: Record<ProviderName, number> = {
  gemini: 0.0009,
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
    const rest = DEFAULT_FAILOVER_ORDER.filter((p) => p !== forceProvider);
    return [forceProvider, ...rest];
  }

  const preferred = TASK_ROUTING[taskType ?? 'general'];
  const rest = DEFAULT_FAILOVER_ORDER.filter((p) => !preferred.includes(p));
  return [...preferred, ...rest];
}
