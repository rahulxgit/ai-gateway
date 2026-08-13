import {
  ChatMessage,
  ChatRequest,
  ContextHandoff,
  ProjectMemory,
  ProviderName,
  StreamChunk,
} from '../types';
import { routeChat, routeChatStream, AllProvidersFailedError } from './router.service';
import { getProjectMemory, setConversationSummary } from './project-memory.service';
import { detectRelevantFiles } from './workspace.service';
import {
  buildProjectContextBlock,
  compressMessages,
  mergeSummaryIntoMemory,
  shouldCompress,
  splitForCompression,
} from './context-compression.service';
import {
  getOrCreateSession,
  historyAsChatMessages,
  saveMessage,
  saveMessages,
  estimateSessionTokenCount,
  autoTitleSessionIfNeeded,
} from './conversation.service';
import { get24hEstimatedCostUsd, recordAnalytics } from './analytics.service';
import { env } from '../config/env';
import { logger, failoverLogger } from '../utils/logger';

export interface OrchestratedRequest extends ChatRequest {
  projectId?: string;
}

const MAX_HISTORY_MESSAGES = 20;

export interface OrchestratedResult {
  sessionId: string;
  content: string;
  provider: ProviderName;
  model: string;
  failoverChain: ProviderName[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  estimatedCostUsd: number;
  latencyMs: number;
}

export class DailyCostBudgetExceededError extends Error {
  public readonly statusCode = 429;
  public readonly currentCostUsd: number;
  public readonly budgetUsd: number;

  constructor(currentCostUsd: number, budgetUsd: number) {
    super(
      `24-hour cost budget exceeded: $${currentCostUsd.toFixed(4)} used of $${budgetUsd.toFixed(4)} allowed.`
    );
    this.name = 'DailyCostBudgetExceededError';
    this.currentCostUsd = currentCostUsd;
    this.budgetUsd = budgetUsd;
  }
}

/**
 * Enforces the optional rolling 24-hour spend budget before any request
 * side-effects or provider calls occur. A value of 0 disables the guard so
 * existing deployments keep their current behavior until a budget is set.
 */
export function enforceDailyCostBudget(): void {
  const budgetUsd = env.dailyCostBudgetUsd;
  if (budgetUsd <= 0) return;

  const currentCostUsd = get24hEstimatedCostUsd();
  if (currentCostUsd >= budgetUsd) {
    throw new DailyCostBudgetExceededError(currentCostUsd, budgetUsd);
  }
}

function buildContextHandoff(
  request: OrchestratedRequest,
  sessionId: string
): ContextHandoff {
  const latestUserMessage = [...request.messages].reverse().find((m) => m.role === 'user');
  const taskDescription = request.taskType ?? latestUserMessage?.content ?? '';

  let memory: ProjectMemory | null = null;
  let relevantFiles: ContextHandoff['relevantFiles'] = [];

  if (request.projectId) {
    memory = getProjectMemory(request.projectId);
    if (memory) {
      relevantFiles = detectRelevantFiles(request.projectId, taskDescription);
    }
  }

  const priorHistory = historyAsChatMessages(sessionId, MAX_HISTORY_MESSAGES);

  const systemParts: string[] = [];
  if (memory) {
    systemParts.push(buildProjectContextBlock(memory));
  }
  systemParts.push(
    'You are one continuous AI assistant. You may be a different underlying model than ' +
      'whoever handled earlier turns in this conversation — that switch was invisible ' +
      'infrastructure-level failover, not a topic change. Continue the work exactly as ' +
      'the previous assistant would have, using the project context and conversation ' +
      'history below. Do not mention or apologize for any provider switch.'
  );

  return {
    systemPrompt: systemParts.join('\n\n---\n\n'),
    relevantFiles,
    recentMessages: priorHistory,
    conversationSummary: memory?.conversationSummary ?? null,
    currentTask: memory?.currentTask ?? null,
    conventions: memory?.conventions ?? {},
  };
}

function relevantFilesBlock(files: ContextHandoff['relevantFiles']): string | null {
  if (!files.length) return null;
  return [
    '# Relevant project files (latest versions)',
    ...files.map((f) => `## ${f.path} (v${f.version})\n\`\`\`${f.language ?? ''}\n${f.content}\n\`\`\``),
  ].join('\n\n');
}

async function maybeCompressInBackground(
  projectId: string | undefined,
  sessionId: string,
  correlationId?: string
) {
  if (!projectId) return;
  const estTokens = estimateSessionTokenCount(sessionId);
  if (!shouldCompress(estTokens)) return;

  const history = historyAsChatMessages(sessionId);
  const { toCompress } = splitForCompression(history);
  if (toCompress.length === 0) return;

  try {
    const summary = await compressMessages(toCompress);
    const memory = getProjectMemory(projectId);
    setConversationSummary(projectId, mergeSummaryIntoMemory(memory?.conversationSummary ?? null, summary));
    logger.info('Compressed conversation context', { correlationId, projectId, sessionId, messagesCompressed: toCompress.length });
  } catch (err) {
    logger.warn('Background compression failed', { correlationId, error: (err as Error).message });
  }
}

function assembleFullMessages(
  request: OrchestratedRequest,
  handoff: ContextHandoff
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: handoff.systemPrompt }];

  const filesBlock = relevantFilesBlock(handoff.relevantFiles);
  if (filesBlock) messages.push({ role: 'system', content: filesBlock });

  if (handoff.conversationSummary) {
    messages.push({
      role: 'system',
      content: `# Summary of earlier conversation\n\n${handoff.conversationSummary}`,
    });
  }

  messages.push(...handoff.recentMessages);
  messages.push(...request.messages.filter((m) => m.role !== 'system'));

  return messages;
}

export async function orchestrateChat(
  request: OrchestratedRequest,
  correlationId?: string
): Promise<OrchestratedResult> {
  enforceDailyCostBudget();

  const session = getOrCreateSession(request.sessionId);
  const handoff = buildContextHandoff(request, session.id);
  const fullMessages = assembleFullMessages(request, handoff);

  saveMessages(
    session.id,
    request.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
  );
  const firstUserMsg = request.messages.find((m) => m.role === 'user');
  if (firstUserMsg) autoTitleSessionIfNeeded(session.id, firstUserMsg.content);

  try {
    const { response, failoverChain } = await routeChat({ ...request, messages: fullMessages }, correlationId);

    saveMessage(session.id, 'assistant', response.content, response.provider, response.model);

    recordAnalytics({
      sessionId: session.id,
      provider: response.provider,
      model: response.model,
      taskType: request.taskType ?? null,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
      estimatedCostUsd: response.estimatedCostUsd,
      latencyMs: response.latencyMs,
      success: true,
      failoverFrom: failoverChain.length > 1 ? failoverChain[0] : null,
    });

    if (failoverChain.length > 1) {
      failoverLogger.info('Context preserved across provider switch', {
        correlationId,
        sessionId: session.id,
        chain: failoverChain,
        finalProvider: response.provider,
      });
    }

    void maybeCompressInBackground(request.projectId, session.id, correlationId);

    return {
      sessionId: session.id,
      content: response.content,
      provider: response.provider,
      model: response.model,
      failoverChain,
      usage: response.usage,
      estimatedCostUsd: response.estimatedCostUsd,
      latencyMs: response.latencyMs,
    };
  } catch (err) {
    if (err instanceof AllProvidersFailedError) {
      for (const attempt of err.attempts) {
        recordAnalytics({
          sessionId: session.id,
          provider: attempt.provider,
          model: 'unknown',
          taskType: request.taskType ?? null,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          latencyMs: 0,
          success: false,
          errorCode: 'ALL_FAILED',
        });
      }
      logger.error('All providers failed', { correlationId, sessionId, attempts: err.attempts });
    }
    throw err;
  }
}

export async function orchestrateChatStream(
  request: OrchestratedRequest,
  onChunk: (chunk: StreamChunk) => void,
  correlationId?: string
): Promise<OrchestratedResult> {
  enforceDailyCostBudget();

  const session = getOrCreateSession(request.sessionId);
  const handoff = buildContextHandoff(request, session.id);
  const fullMessages = assembleFullMessages(request, handoff);

  saveMessages(
    session.id,
    request.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
  );
  const firstUserMsg = request.messages.find((m) => m.role === 'user');
  if (firstUserMsg) autoTitleSessionIfNeeded(session.id, firstUserMsg.content);

  try {
    const { response, failoverChain } = await routeChatStream(
      { ...request, messages: fullMessages },
      onChunk,
      correlationId
    );

    saveMessage(session.id, 'assistant', response.content, response.provider, response.model);

    recordAnalytics({
      sessionId: session.id,
      provider: response.provider,
      model: response.model,
      taskType: request.taskType ?? null,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
      estimatedCostUsd: response.estimatedCostUsd,
      latencyMs: response.latencyMs,
      success: true,
      failoverFrom: failoverChain.length > 1 ? failoverChain[0] : null,
    });

    void maybeCompressInBackground(request.projectId, session.id, correlationId);

    return {
      sessionId: session.id,
      content: response.content,
      provider: response.provider,
      model: response.model,
      failoverChain,
      usage: response.usage,
      estimatedCostUsd: response.estimatedCostUsd,
      latencyMs: response.latencyMs,
    };
  } catch (err) {
    logger.error('Streaming orchestration failed', { correlationId, sessionId: session.id, error: (err as Error).message });
    throw err;
  }
}
