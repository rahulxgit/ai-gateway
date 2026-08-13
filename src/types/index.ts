// ---------------------------------------------------------------------------
// Core domain types shared across the gateway. Every provider adapter,
// service, and route depends on these — keep them stable.
// ---------------------------------------------------------------------------

// Single source of truth for every provider name in the gateway. The type
// below is derived from this array (not duplicated) specifically so that
// Zod validation schemas, the provider registry, and the TypeScript type
// can never drift apart again — that drift is exactly what let a valid
// forceProvider value like "fireworks" get rejected by request validation
// after the adapter itself was already wired up and working.
export const PROVIDER_NAMES = [
  'gemini', 'anthropic', 'openai', 'groq', 'together', 'openrouter',
  'huggingface', 'deepseek', 'kimi', 'cerebras', 'mistral', 'cloudflare',
  'fireworks', 'inference', 'nebius', 'sambanova', 'nvidia', 'novita',
  'baseten', 'modelscope', 'aimlapi',
] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

export type TaskType =
  | 'coding' | 'reasoning' | 'creative' | 'fast' | 'cheap' | 'large-context' | 'general';

export interface ImageAttachment { mimeType: string; base64: string; }
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; images?: ImageAttachment[]; }
export interface ChatRequest { sessionId?: string; messages: ChatMessage[]; taskType?: TaskType; forceProvider?: ProviderName; model?: string; temperature?: number; maxTokens?: number; stream?: boolean; }
export interface UsageStats { promptTokens: number; completionTokens: number; totalTokens: number; }
export interface ProviderResponse { provider: ProviderName; model: string; content: string; usage: UsageStats; latencyMs: number; estimatedCostUsd: number; finishReason?: string; }
export interface StreamChunk { provider: ProviderName; model: string; delta: string; done: boolean; usage?: UsageStats; }

export type ProviderErrorCode =
  | 'RATE_LIMITED' | 'QUOTA_EXCEEDED' | 'TIMEOUT' | 'SERVER_ERROR' | 'UNAVAILABLE'
  | 'AUTH_ERROR' | 'ACCOUNT_SUSPENDED' | 'INSUFFICIENT_CREDITS' | 'NOT_FOUND'
  | 'INVALID_REQUEST' | 'UNKNOWN';

export class ProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly provider: ProviderName;
  public readonly retryable: boolean;
  public readonly statusCode?: number;

  constructor(provider: ProviderName, code: ProviderErrorCode, message: string, statusCode?: number) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = ![
      'AUTH_ERROR',
      'NOT_FOUND',
      'ACCOUNT_SUSPENDED',
      'INSUFFICIENT_CREDITS',
      'INVALID_REQUEST',
    ].includes(code);
  }
}

export interface ProviderHealth { provider: ProviderName; status: 'healthy' | 'degraded' | 'rate_limited' | 'down' | 'unknown'; lastCheckedAt: string; lastError?: string; avgLatencyMs?: number; consecutiveFailures: number; }
export interface ProviderAdapterOptions { messages: ChatMessage[]; model?: string; temperature?: number; maxTokens?: number; }
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
export interface ModelAvailabilityResult { status: 'available' | 'unavailable' | 'undetermined'; model: string; detail?: string; }
export interface ChatSession { id: string; title: string; createdAt: string; updatedAt: string; }

export interface ConversationRecord { id: string; sessionId: string; role: ChatMessage['role']; content: string; provider: ProviderName | null; model: string | null; createdAt: string; }
export interface ProjectFile { path: string; content: string; language?: string; updatedAt: string; version: number; }
export interface FileEdit { id: string; path: string; diffSummary: string; provider: ProviderName | null; createdAt: string; }
export interface ArchitectureDecision { id: string; summary: string; createdAt: string; }
export interface BugRecord { id: string; description: string; fix?: string; resolved: boolean; createdAt: string; }
export interface CommitSummary { id: string; message: string; createdAt: string; }
export interface CodingConventions { namingConvention?: string; folderStructure?: string; formatting?: string; commentStyle?: string; typescriptConfig?: string; eslintRules?: string; prettierRules?: string; errorHandlingPattern?: string; loggingStyle?: string; }
export interface ProjectMemory { projectId: string; name: string; goal: string; currentTask: string | null; completedTasks: string[]; pendingTasks: string[]; fileTree: string[]; files: Record<string, ProjectFile>; recentEdits: FileEdit[]; architectureDecisions: ArchitectureDecision[]; conventions: CodingConventions; librariesUsed: string[]; frameworkVersions: Record<string, string>; buildCommands: string[]; dependencies: string[]; todoList: string[]; errorsEncountered: BugRecord[]; commitSummaries: CommitSummary[]; userPreferences: Record<string, string>; conversationSummary: string | null; createdAt: string; updatedAt: string; }
export interface ProjectSnapshot { id: string; projectId: string; label: string; memory: ProjectMemory; createdAt: string; }
export interface ContextHandoff { systemPrompt: string; relevantFiles: ProjectFile[]; recentMessages: ChatMessage[]; conversationSummary: string | null; currentTask: string | null; conventions: CodingConventions; }
export interface AnalyticsRecord { id: string; sessionId: string | null; provider: ProviderName; model: string; taskType: TaskType | null; promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number; latencyMs: number; success: boolean; errorCode: string | null; failoverFrom: ProviderName | null; createdAt: string; }
