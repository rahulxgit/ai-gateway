export type ProviderName =
  | 'gemini'
  | 'anthropic'
  | 'openai'
  | 'groq'
  | 'openrouter'
  | 'huggingface'
  | 'cerebras'
  | 'mistral'
  | 'cloudflare'
  | 'fireworks'
  | 'nvidia'
  | 'novita'
  | 'baseten'
  | 'cohere';

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
  // Names of text-extracted files (PDF/DOCX/txt) attached to this message,
  // for display purposes only — the extracted text itself lives inside
  // `content` (sent to the model) but is never shown raw in the UI, same
  // as how Claude.ai/ChatGPT show a clean file chip instead of a text dump.
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

export interface ProviderHealth {
  provider: ProviderName;
  status:
    | 'configured'
    | 'healthy'
    | 'degraded'
    | 'rate_limited'
    | 'auth_error'
    | 'model_unavailable'
    | 'billing_required'
    | 'retired'
    | 'unknown';
  lastCheckedAt: string;
  lastError?: string;
  avgLatencyMs?: number;
  consecutiveFailures: number;
  lastCheckSource?: 'traffic' | 'probe';
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
  'openrouter',
  'huggingface',
  'cerebras',
  'mistral',
  'cloudflare',
  'fireworks',
  'nvidia',
  'novita',
  'baseten',
  'cohere',
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

// Light metadata for the provider picker UI only — never sent to the
// backend, purely to make the provider list scannable/searchable instead of
// a flat alphabetical list. "free" here means a genuinely free tier or free
// trial credits exist; it does not guarantee $0 for every model a provider
// hosts.
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
  openrouter: { label: 'OpenRouter', free: true, note: 'Free-tagged models' },
  huggingface: { label: 'Hugging Face', free: true, note: 'Router-proxied' },
  cerebras: { label: 'Cerebras', free: true, note: '1M tokens/day, fastest' },
  mistral: { label: 'Mistral', free: true, note: '~1B tokens/mo, Codestral' },
  cloudflare: { label: 'Cloudflare Workers AI', free: true, note: 'Needs account ID' },
  fireworks: { label: 'Fireworks AI', free: true, note: 'Free trial credits' },
  nvidia: { label: 'NVIDIA NIM', free: true, note: 'Free developer tier' },
  novita: { label: 'Novita AI', free: true, note: 'Free starter credits' },
  baseten: { label: 'Baseten', free: true, note: 'Free trial credits' },
  cohere: { label: 'Cohere', free: true, note: 'Free, no card, 1,000 req/month' },
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

// Known-good ":free"-suffixed OpenRouter models — zero cost against an
// OpenRouter key you already have, no separate billing with DeepSeek or
// Moonshot required. Curated rather than fetched live since OpenRouter's
// free catalog changes; update this list if a model gets deprecated.
export const OPENROUTER_FREE_MODELS: { value: string; label: string }[] = [
  { value: 'deepseek/deepseek-chat-v3.1:free', label: 'DeepSeek Chat V3.1 (free)' },
  { value: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (free, reasoning)' },
  { value: 'moonshotai/kimi-k2:free', label: 'Kimi K2 (free)' },
  { value: 'qwen/qwen3-235b-a22b:free', label: 'Qwen3 235B (free)' },
  { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)' },
  { value: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B (free)' },
];
