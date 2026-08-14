export type ProviderName =
  | 'gemini' | 'anthropic' | 'openai' | 'groq' | 'together' | 'openrouter' | 'huggingface'
  | 'deepseek' | 'kimi' | 'cerebras' | 'mistral' | 'cloudflare' | 'fireworks' | 'inference'
  | 'nebius' | 'sambanova' | 'nvidia' | 'novita' | 'baseten' | 'modelscope' | 'aimlapi';
export type TaskType = 'coding' | 'reasoning' | 'creative' | 'fast' | 'cheap' | 'large-context' | 'general';
export interface ImageAttachment { mimeType: string; base64: string; }
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; provider?: ProviderName | null; model?: string | null; failoverChain?: ProviderName[]; createdAt?: string; images?: ImageAttachment[]; attachmentNames?: string[]; }
export interface ChatResult { sessionId: string; content: string; provider: ProviderName; model: string; failoverChain: ProviderName[]; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; estimatedCostUsd: number; latencyMs: number; }
export type ProviderHealthStatus = 'healthy' | 'degraded' | 'rate_limited' | 'quota_exhausted' | 'authentication_failed' | 'forbidden' | 'model_unavailable' | 'account_suspended' | 'unavailable' | 'paid_only' | 'down' | 'unknown';
export interface ProviderHealth { provider: ProviderName; status: ProviderHealthStatus; lastCheckedAt: string; lastError?: string; errorCode?: string; statusMessage?: string; model?: string; avgLatencyMs?: number; consecutiveFailures: number; }
export interface ChatSession { id: string; title: string; createdAt: string; updatedAt: string; }
export interface AnalyticsSummary { totalRequests: number; dailyRequests: number; totalTokens: number; estimatedTotalCostUsd: number; avgLatencyMs: number; successRate: number; failoverEvents: number; windowHours?: number; windowStart?: string; byProvider: { provider: ProviderName; requests: number; tokens: number; costUsd: number; avgLatencyMs: number; successRate: number }[]; }
export const ALL_PROVIDERS: ProviderName[] = ['gemini','anthropic','openai','groq','together','openrouter','huggingface','deepseek','kimi','cerebras','mistral','cloudflare','fireworks','inference','nebius','sambanova','nvidia','novita','baseten','modelscope','aimlapi'];
export const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'general', label: 'General' }, { value: 'coding', label: 'Coding' }, { value: 'reasoning', label: 'Reasoning' },
  { value: 'creative', label: 'Creative' }, { value: 'fast', label: 'Fast' }, { value: 'cheap', label: 'Cheap' }, { value: 'large-context', label: 'Large context' },
];
export interface ProviderMeta { label: string; free: boolean; note: string; }
export const PROVIDER_META: Record<ProviderName, ProviderMeta> = {
  gemini: { label: 'Gemini', free: true, note: 'Gemini 2.5 Flash-Lite · free tier' },
  anthropic: { label: 'Anthropic', free: false, note: 'Paid API · Claude' },
  openai: { label: 'OpenAI', free: false, note: 'Paid API · GPT' },
  groq: { label: 'Groq', free: true, note: 'GPT-OSS 20B · free plan' },
  together: { label: 'Together AI', free: false, note: 'Paid API · OpenAI-compatible' },
  openrouter: { label: 'OpenRouter', free: true, note: 'openrouter/free · free models' },
  huggingface: { label: 'Hugging Face', free: false, note: '$0.10 monthly credit, not guaranteed free inference' },
  deepseek: { label: 'DeepSeek', free: false, note: 'Paid API / balance required' },
  kimi: { label: 'Kimi (Moonshot)', free: false, note: 'Paid API' },
  cerebras: { label: 'Cerebras', free: true, note: 'Free-tier inference' },
  mistral: { label: 'Mistral', free: true, note: 'Experiment/free tier' },
  cloudflare: { label: 'Cloudflare Workers AI', free: true, note: '10K free Neurons/day' },
  fireworks: { label: 'Fireworks AI', free: false, note: 'Trial/paid credits' },
  inference: { label: 'Inference.net', free: false, note: 'Trial credits, then paid' },
  nebius: { label: 'Nebius AI Studio', free: false, note: 'Trial/paid credits' },
  sambanova: { label: 'SambaNova Cloud', free: false, note: 'Account-tier dependent' },
  nvidia: { label: 'NVIDIA API', free: false, note: 'Trial/credit access' },
  novita: { label: 'Novita AI', free: false, note: 'Starter/trial credits' },
  baseten: { label: 'Baseten', free: false, note: 'Trial/paid inference' },
  modelscope: { label: 'ModelScope', free: false, note: 'Quota/account dependent' },
  aimlapi: { label: 'AI/ML API', free: false, note: 'Trial/paid credits' },
};
export interface ProjectMemory { projectId: string; name: string; goal: string; currentTask: string | null; completedTasks: string[]; pendingTasks: string[]; fileTree: string[]; architectureDecisions: { id: string; summary: string; createdAt: string }[]; createdAt: string; updatedAt: string; }
export interface UploadResult { filename: string; mimeType: string; kind: 'text' | 'image' | 'unsupported'; sizeBytes: number; extractedText: string | null; base64: string | null; truncated: boolean; savedToProject: boolean; }
export const OPENROUTER_FREE_MODELS: { value: string; label: string }[] = [{ value: 'openrouter/free', label: 'OpenRouter Free Router' }];
