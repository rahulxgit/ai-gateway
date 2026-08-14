export type ProviderName =
  | 'gemini'
  | 'anthropic'
  | 'openai'
  | 'groq'
  | 'together'
  | 'openrouter'
  | 'huggingface'
  | 'deepseek'
  | 'kimi'
  | 'cerebras'
  | 'mistral'
  | 'cloudflare'
  | 'fireworks'
  | 'inference'
  | 'nebius'
  | 'sambanova'
  | 'nvidia'
  | 'novita'
  | 'baseten'
  | 'modelscope'
  | 'aimlapi';

export type TaskType =
  | 'coding'
  | 'reasoning'
  | 'creative'
  | 'fast'
  | 'cheap'
  | 'large-context'
  | 'general';

export interface ImageAttachment {
  mimeType: string;
  base64: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  provider?: ProviderName | null;
  model?: string | null;
  failoverChain?: ProviderName[];
  createdAt?: string;
  images?: ImageAttachment[];
  attachmentNames?: string[];
}

export interface ChatResult {
  sessionId: string;
  content: string;
  provider: ProviderName;
  model: string;
  failoverChain: ProviderName[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  estimatedCostUsd: number;
  latencyMs: number;
}

export type ProviderHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'authentication_failed'
  | 'forbidden'
  | 'model_unavailable'
  | 'account_suspended'
  | 'unavailable'
  | 'down'
  | 'unknown';

export interface ProviderHealth {
  provider: ProviderName;
  status: ProviderHealthStatus;
  lastCheckedAt: string;
  lastError?: string;
  errorCode?: string;
  statusMessage?: string;
  model?: string;
  avgLatencyMs?: number;
  consecutiveFailures: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsSummary {
  totalRequests: number;
  dailyRequests: number;
  totalTokens: number;
  estimatedTotalCostUsd: number;
  avgLatencyMs: number;
  successRate: number;
  failoverEvents: number;
  windowHours?: number;
  windowStart?: string;
  byProvider: {
    provider: ProviderName;
    requests: number;
    tokens: number;
    costUsd: number;
    avgLatencyMs: number;
    successRate: number;
  }[];
}

export const ALL_PROVIDERS: ProviderName[] = [
  'gemini',
  'anthropic',
  'openai',
  'groq',
  'together',
  'openrouter',
  'huggingface',
  'deepseek',
  'kimi',
  'cerebras',
  'mistral',
  'cloudflare',
  'fireworks',
  'inference',
  'nebius',
  'sambanova',
  'nvidia',
  'novita',
  'baseten',
  'modelscope',
  'aimlapi',
];

export const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'coding', label: 'Coding' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'creative', label: 'Creative' },
  { value: 'fast', label: 'Fast' },
  { value: 'cheap', label: 'Cheap' },
  { value: 'large-context', label: 'Large context' },
];

export interface ProviderMeta {
  label: string;
  free: boolean;
  note: string;
}

export const PROVIDER_META: Record<ProviderName, ProviderMeta> = {
  gemini: { label: 'Gemini', free: true, note: 'Vision · fast free tier' },
  anthropic: { label: 'Anthropic', free: false, note: 'Vision · Claude' },
  openai: { label: 'OpenAI', free: false, note: 'Vision · GPT' },
  groq: { label: 'Groq', free: true, note: 'Fastest inference' },
  together: { label: 'Together AI', free: true, note: '131K context' },
  openrouter: { label: 'OpenRouter', free: true, note: 'Free-tagged models' },
  huggingface: { label: 'Hugging Face', free: true, note: 'Router-proxied' },
  deepseek: { label: 'DeepSeek', free: true, note: '384K output, cheap' },
  kimi: { label: 'Kimi (Moonshot)', free: false, note: '256K context' },
  cerebras: { label: 'Cerebras', free: true, note: '1M tokens/day, fastest' },
  mistral: { label: 'Mistral', free: true, note: '~1B tokens/mo, Codestral' },
  cloudflare: { label: 'Cloudflare Workers AI', free: true, note: 'Needs account ID' },
  fireworks: { label: 'Fireworks AI', free: true, note: 'Free trial credits' },
  inference: { label: 'Inference.net', free: true, note: 'Free tier' },
  nebius: { label: 'Nebius AI Studio', free: true, note: 'Free trial credits' },
  sambanova: { label: 'SambaNova Cloud', free: true, note: 'Up to 256K context' },
  nvidia: { label: 'NVIDIA NIM', free: true, note: 'Free developer tier' },
  novita: { label: 'Novita AI', free: true, note: 'Free starter credits' },
  baseten: { label: 'Baseten', free: true, note: 'Free trial credits' },
  modelscope: { label: 'ModelScope', free: true, note: 'Free tier (Alibaba)' },
  aimlapi: { label: 'AI/ML API', free: true, note: 'Free credits, model hub' },
};

export interface ProjectMemory {
  projectId: string;
  name: string;
  goal: string;
  currentTask: string | null;
  completedTasks: string[];
  pendingTasks: string[];
  fileTree: string[];
  architectureDecisions: { id: string; summary: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface UploadResult {
  filename: string;
  mimeType: string;
  kind: 'text' | 'image' | 'unsupported';
  sizeBytes: number;
  extractedText: string | null;
  base64: string | null;
  truncated: boolean;
  savedToProject: boolean;
}

export const OPENROUTER_FREE_MODELS: { value: string; label: string }[] = [
  { value: 'deepseek/deepseek-chat-v3.1:free', label: 'DeepSeek Chat V3.1 (free)' },
  { value: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (free, reasoning)' },
  { value: 'moonshotai/kimi-k2:free', label: 'Kimi K2 (free)' },
  { value: 'qwen/qwen3-235b-a22b:free', label: 'Qwen3 235B (free)' },
  { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)' },
  { value: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B (free)' },
];
