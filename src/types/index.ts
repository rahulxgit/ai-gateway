// ---------------------------------------------------------------------------
// Core domain types shared across the gateway. Every provider adapter,
// service, and route depends on these — keep them stable.
// ---------------------------------------------------------------------------

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

// Discriminates retryable failures from permanent ones so the router knows
// whether to fail over to the next provider or bubble up the error.
export type ProviderErrorCode =
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'TIMEOUT'
  | 'SERVER_ERROR'
  | 'UNAVAILABLE'
  | 'AUTH_ERROR'
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
    // AUTH_ERROR / INVALID_REQUEST are the caller's fault and won't be fixed
    // by switching providers, but the gateway still fails over to be safe
    // for AUTH/UNAVAILABLE-class issues except invalid request payloads.
    this.retryable = code !== 'INVALID_REQUEST';
  }
}

export interface ProviderHealth {
  provider: ProviderName;
  status: 'healthy' | 'degraded' | 'rate_limited' | 'down' | 'unknown';
  lastCheckedAt: string;
  lastError?: string;
  avgLatencyMs?: number;
  consecutiveFailures: number;
}

export interface ProviderAdapterOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// The interface every single provider adapter must implement. This is what
// makes the router provider-agnostic and lets us add new providers by just
// writing a new class, without touching routing logic.
export interface ProviderAdapter {
  readonly name: ProviderName;
  readonly defaultModel: string;
  isConfigured(): boolean;
  chat(options: ProviderAdapterOptions): Promise<ProviderResponse>;
  chatStream(
    options: ProviderAdapterOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ProviderResponse>;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Persistent Project Context: conversation memory, project memory, workspace
// ---------------------------------------------------------------------------

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

// The full persistent memory for a single project. This is what gets
// reloaded and re-injected any time the gateway switches providers, so a
// new model can continue as if it had been there the whole time.
export interface ProjectMemory {
  projectId: string;
  name: string;
  goal: string;
  currentTask: string | null;
  completedTasks: string[];
  pendingTasks: string[];
  fileTree: string[]; // folder/file paths, structure only
  files: Record<string, ProjectFile>; // path -> file
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
  conversationSummary: string | null; // compressed history when context grows large
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

// What the orchestrator assembles right before calling a provider — the
// "handoff packet" that lets a brand new provider continue seamlessly.
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
