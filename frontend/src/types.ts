export type ProviderName =
  | 'gemini'
  | 'anthropic'
  | 'openai'
  | 'groq'
  | 'together'
  | 'openrouter'
  | 'huggingface';

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
