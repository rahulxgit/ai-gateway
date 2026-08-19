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
  'githubmodels',
  'cohere',
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
  // Automatic-routing mode switch (ignored when forceProvider is set, since
  // that already pins a single provider regardless of free/paid status).
  // true or undefined (default): only genuinely free/no-billing-risk
  // providers are candidates — this is the gateway's historical behavior.
  // false: paid/trial providers become eligible too, tried after the free
  // pool is exhausted rather than instead of it.
  freeOnly?: boolean;
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
      'RATE_LIMITED',
      'QUOTA_EXCEEDED',
      'AUTH_ERROR',
      'NOT_FOUND',
      'ACCOUNT_SUSPENDED',
      'INSUFFICIENT_CREDITS',
      'INVALID_REQUEST',
    ].includes(code);
  }
}

export interface ProviderHealth {
  provider: ProviderName;
  // configured: has an API key set but has never been successfully probed
  // or used yet. unknown: not configured at all (never eligible for
  // routing, so there's nothing meaningful to report). Every other status
  // reflects the most recent real signal — either a live request the
  // gateway routed, or a background health probe — classified through the
  // same classifyError() mapping either way, so a request-driven failure
  // and a probe-driven failure of the same underlying cause always read
  // identically here.
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
  // True if lastCheckedAt came from a background probe rather than a real
  // routed chat request. Lets the UI/logs distinguish "we know this is
  // fine because a user request just succeeded" from "we know this is
  // fine because our own idle probe just succeeded" — useful when
  // diagnosing why a provider looks healthy despite no recent traffic.
  lastCheckSource?: 'traffic' | 'probe';
}

export interface ProviderAdapterOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ProviderAdapter {
  readonly name: ProviderName;
  readonly defaultModel: string;
  readonly supportsVision: boolean;
  readonly maxOutputTokens: number;
  // Model IDs this provider serves at no cost, when known statically.
  // Undefined/empty means "no free tier" — never guess a value here.
  readonly freeModels?: string[];
  isConfigured(): boolean;
  chat(options: ProviderAdapterOptions): Promise<ProviderResponse>;
  chatStream(
    options: ProviderAdapterOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ProviderResponse>;
  checkModelAvailability?(): Promise<ModelAvailabilityResult>;
  // Lightweight, zero/near-zero-cost liveness probe for the background
  // health-check service — a GET against the provider's models list where
  // available, never a real completion request. Resolves on success;
  // rejects with a classifyError()-produced ProviderError on failure, so
  // callers get the exact same error taxonomy a real chat() failure would.
  // Optional: providers with no such probe available simply aren't
  // actively probed, and fall back to whatever real traffic reveals.
  probeHealth?(): Promise<void>;
}

export interface ModelAvailabilityResult {
  status: 'available' | 'unavailable' | 'undetermined';
  model: string;
  detail?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  sessionId: string;
  role: ChatMessage['role'];
  content: string;
  provider: ProviderName | null;
  model: string | null;
  createdAt: string;
}

export interface ProjectFile {
  path: string;
  content: string;
  language?: string;
  updatedAt: string;
  version: number;
}

export interface FileEdit {
  id: string;
  path: string;
  diffSummary: string;
  provider: ProviderName | null;
  createdAt: string;
}

export interface ArchitectureDecision {
  id: string;
  summary: string;
  createdAt: string;
}

export interface BugRecord {
  id: string;
  description: string;
  fix?: string;
  resolved: boolean;
  createdAt: string;
}

export interface CommitSummary {
  id: string;
  message: string;
  createdAt: string;
}

export interface CodingConventions {
  namingConvention?: string;
  folderStructure?: string;
  formatting?: string;
  commentStyle?: string;
  typescriptConfig?: string;
  eslintRules?: string;
  prettierRules?: string;
  errorHandlingPattern?: string;
  loggingStyle?: string;
}

export interface ProjectMemory {
  projectId: string;
  name: string;
  goal: string;
  currentTask: string | null;
  completedTasks: string[];
  pendingTasks: string[];
  fileTree: string[];
  recentEdits: FileEdit[];
  architectureDecisions: ArchitectureDecision[];
  conventions: CodingConventions;
  librariesUsed: string[];
  frameworkVersions: Record<string, string>;
  buildCommands: string[];
  dependencies: string[];
  todoList: string[];
  errorsEncountered: BugRecord[];
  commitSummaries: CommitSummary[];
  userPreferences: Record<string, string>;
  conversationSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSnapshot {
  id: string;
  projectId: string;
  label: string;
  memory: ProjectMemory;
  createdAt: string;
}

export interface ContextHandoff {
  systemPrompt: string;
  relevantFiles: ProjectFile[];
  recentMessages: ChatMessage[];
  conversationSummary: string | null;
  currentTask: string | null;
  conventions: CodingConventions;
}

export interface AnalyticsRecord {
  id: string;
  sessionId: string | null;
  provider: ProviderName;
  model: string;
  taskType: TaskType | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  success: boolean;
  errorCode: string | null;
  failoverFrom: ProviderName | null;
  createdAt: string;
}
