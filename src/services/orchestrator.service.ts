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
  estimateSessionTokenCount,
} from './conversation.service';
import { recordAnalytics } from './analytics.service';
import { logger, failoverLogger } from '../utils/logger';

export interface OrchestratedRequest extends ChatRequest {
  projectId?: string;
}

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

/**
 * Assembles the "handoff packet" that lets any provider — including one
 * that has never seen this conversation before, because we just failed
 * over to it — continue exactly where the last one left off.
 *
 * Order of assembly mirrors the required provider-switching sequence:
 * 1. Load project memory   2. Load conversation memory
 * 3. Load relevant files   4. Load current task
 * 5. Load coding standards 6. (caller continues from here)
 */
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

  // Conversation memory: prior turns from the DB, not just what the caller
  // passed in this request — this is what makes failover invisible even if
  // the client only sends the latest message.
  const priorHistory = historyAsChatMessages(sessionId);

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

/**
 * Runs compression in the background if the session has grown large, so
 * the *next* request benefits without blocking the current one.
 */
async function maybeCompressInBackground(projectId: string | undefined, sessionId: string) {
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
    logger.info('Compressed conversation context', { projectId, sessionId, messagesCompressed: toCompress.length });
  } catch (err) {
    logger.warn('Background compression failed', { error: (err as Error).message });
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

  // Recent verbatim turns from persistent memory, then whatever new
  // message(s) this request is adding on top.
  messages.push(...handoff.recentMessages);
  messages.push(...request.messages.filter((m) => m.role !== 'system'));

  return messages;
}

/**
 * Non-streaming entry point. This is what controllers should call instead
 * of routeChat directly — it guarantees project + conversation continuity
 * across any provider failover that happens underneath.
 */
export async function orchestrateChat(request: OrchestratedRequest): Promise<OrchestratedResult> {
  const session = getOrCreateSession(request.sessionId);
  const handoff = buildContextHandoff(request, session.id);
  const fullMessages = assembleFullMessages(request, handoff);

  // Persist the new user-facing message(s) now, before calling the
  // provider, so context is never lost even if the process crashes mid-call.
  for (const m of request.messages.filter((m) => m.role !== 'system')) {
    saveMessage(session.id, m.role, m.content);
  }

  try {
    const { response, failoverChain } = await routeChat({ ...request, messages: fullMessages });

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
        sessionId: session.id,
        chain: failoverChain,
        finalProvider: response.provider,
      });
    }

    void maybeCompressInBackground(request.projectId, session.id);

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
    }
    throw err;
  }
}

/**
 * Streaming entry point with the same context-handoff guarantees. Failover
 * before the first token is invisible to the caller; failover mid-stream is
 * surfaced as an error (see router.service for rationale).
 */
export async function orchestrateChatStream(
  request: OrchestratedRequest,
  onChunk: (chunk: StreamChunk) => void
): Promise<OrchestratedResult> {
  const session = getOrCreateSession(request.sessionId);
  const handoff = buildContextHandoff(request, session.id);
  const fullMessages = assembleFullMessages(request, handoff);

  for (const m of request.messages.filter((m) => m.role !== 'system')) {
    saveMessage(session.id, m.role, m.content);
  }

  const { response, failoverChain } = await routeChatStream(
    { ...request, messages: fullMessages },
    onChunk
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

  void maybeCompressInBackground(request.projectId, session.id);

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
}
