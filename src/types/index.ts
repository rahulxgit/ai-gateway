// ---------------------------------------------------------------------------
// Core domain types shared across the gateway. Every provider adapter,
// service, and route depends on these — keep them stable.
// ---------------------------------------------------------------------------

export const PROVIDER_NAMES = [
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
] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

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
  images?: ImageAttachment[];
}

export interface ChatRequest {
  sessionId?: string;
  messages: ChatMessage[];
  taskType?: TaskType;
  forceProvider?: ProviderName;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ProviderResponse {
  provider: ProviderName;
  model: string;
  content: string;
  usage: UsageStats;
  latencyMs: number;
  estimatedCostUsd: number;
  finishReason?: string;
}

export interface StreamChunk {
  provider: ProviderName;
  model: string;
  delta: string;
  done: boolean;
  usage?: UsageStats;
}

export type ProviderErrorCode =
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'TIMEOUT'
  | 'SERVER_ERROR'
  | 'UNAVAILABLE'
  | 'AUTH_ERROR'
  | 'FORBIDDEN'
  | 'ACCOUNT_SUSPENDED'
  | 'INSUFFICIENT_CREDITS'
  | 'NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'UNKNOWN';

export class ProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly provider: ProviderName;
  public readonly retryable: boolean;
  public readonly statusCode?: number;

  constructor(
    provider: ProviderName,
    code: ProviderErrorCode,
    message: string,
    statusCode?: number
  ) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = ![
      'AUTH_ERROR',
      'FORBIDDEN',
      'NOT_FOUND',
      'ACCOUNT_SUSPENDED',
      'INSUFFICIENT_CREDITS',
      'INVALID_REQUEST',
    ].includes(code);
  }
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
  | 'paid_only'
  | 'down'
  | 'unknown';

export interface ProviderHealth {
  provider: ProviderName;
  status: ProviderHealthStatus;
  lastCheckedAt: string;
  lastError?: string;
  errorCode?: ProviderErrorCode;
  statusMessage?: string;
  model?: string;
  avgLatencyMs?: number;
  consecutiveFailures: number;
}

export interface ProviderAdapterOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelAvailabilityResult {
  status: 'available' | 'unavailable' | 'undetermined';
  model: string;
  detail?: string;
}

export interface ProviderAdapter {
  readonly name: ProviderName;
  readonly defaultModel: string;
  readonly supportsVision: boolean;
  readonly maxOutputTokens: number;
  isConfigured(): boolean;
  chat(options: ProviderAdapterOptions): Promise<ProviderResponse>;
  chatStream(options: ProviderAdapterOptions, onChunk: (chunk: StreamChunk) => void): Promise<ProviderResponse>;
  checkModelAvailability?(): Promise<ModelAvailabilityResult>;
}
