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
  | 'mistral';

export type TaskType =
  | 'coding'
  | 'reasoning'
  | 'creative'
  | 'fast'
  | 'cheap'
  | 'large-context'
  | 'general';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  provider?: ProviderName | null;
  model?: string | null;
  failoverChain?: ProviderName[];
  createdAt?: string;
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
  status: 'healthy' | 'degraded' | 'rate_limited' | 'down' | 'unknown';
  lastCheckedAt: string;
  lastError?: string;
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
