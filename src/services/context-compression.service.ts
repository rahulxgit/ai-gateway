import { ChatMessage, ProjectMemory } from '../types';
import { getProvider } from '../providers/registry';
import { listConfiguredProviders } from '../providers/registry';
import { logger } from '../utils/logger';

const COMPRESSION_PROMPT = `You are compressing a software engineering conversation into a compact but complete summary for another AI model that will continue the work.

Preserve, explicitly and losslessly:
- Architecture decisions and why they were made
- Public APIs, function/class signatures, and class relationships
- Important code snippets that are still relevant (keep them short but exact)
- Open TODOs and unresolved bugs
- The user's original requirements and any constraints they stated
- Anything already completed, so it is not redone

Drop: small talk, resolved back-and-forth, superseded code versions, restated context.

Write the summary as structured markdown with headers. Be dense, not verbose.`;

/**
 * Summarizes a batch of older messages using whatever provider is
 * currently healthy, so a new conversation window can stay small without
 * losing the information a fresh provider would need to continue.
 */
export async function compressMessages(messages: ChatMessage[]): Promise<string> {
  const configured = listConfiguredProviders();
  if (configured.length === 0) {
    // No providers available to summarize with — fall back to a naive
    // truncation-based summary so callers always get *something* usable.
    return naiveSummary(messages);
  }

  const adapter = getProvider(configured[0]);
  const transcript = messages
    .map((m) => `[${m.role.toUpperCase()}]\n${m.content}`)
    .join('\n\n---\n\n');

  try {
    const response = await adapter.chat({
      messages: [
        { role: 'system', content: COMPRESSION_PROMPT },
        { role: 'user', content: transcript },
      ],
      maxTokens: 1200,
      temperature: 0.2,
    });
    return response.content;
  } catch (err) {
    logger.warn('Context compression failed, falling back to naive summary', {
      error: (err as Error).message,
    });
    return naiveSummary(messages);
  }
}

function naiveSummary(messages: ChatMessage[]): string {
  const codeBlocks = messages
    .flatMap((m) => [...m.content.matchAll(/```[\s\S]*?```/g)].map((x) => x[0]))
    .slice(-5);
  const bulletized = messages
    .filter((m) => m.role === 'user')
    .map((m) => `- ${m.content.slice(0, 200)}`)
    .join('\n');

  return [
    '## Conversation Summary (auto-generated, no provider available)',
    '### User requests so far',
    bulletized || '(none)',
    '### Recent code snippets',
    codeBlocks.join('\n\n') || '(none)',
  ].join('\n\n');
}

const COMPRESSION_TRIGGER_TOKENS = 12_000;
const KEEP_RECENT_MESSAGES = 10;

export function shouldCompress(estimatedTokens: number): boolean {
  return estimatedTokens > COMPRESSION_TRIGGER_TOKENS;
}

/**
 * Given full history, returns the tail to keep verbatim and the head to
 * compress. Recent turns stay word-for-word (the model needs exact recent
 * context); everything older gets folded into a summary.
 */
export function splitForCompression(
  history: ChatMessage[]
): { toCompress: ChatMessage[]; toKeep: ChatMessage[] } {
  if (history.length <= KEEP_RECENT_MESSAGES) {
    return { toCompress: [], toKeep: history };
  }
  return {
    toCompress: history.slice(0, history.length - KEEP_RECENT_MESSAGES),
    toKeep: history.slice(history.length - KEEP_RECENT_MESSAGES),
  };
}

export function mergeSummaryIntoMemory(
  existingSummary: string | null,
  newSummary: string
): string {
  if (!existingSummary) return newSummary;
  return `${existingSummary}\n\n---\n\n${newSummary}`;
}

export function buildProjectContextBlock(memory: ProjectMemory): string {
  const lines: string[] = [];
  lines.push(`# Project: ${memory.name}`);
  if (memory.goal) lines.push(`Goal: ${memory.goal}`);
  if (memory.currentTask) lines.push(`Current task: ${memory.currentTask}`);
  if (memory.pendingTasks.length) {
    lines.push(`Pending tasks:\n${memory.pendingTasks.map((t) => `- ${t}`).join('\n')}`);
  }
  if (memory.completedTasks.length) {
    lines.push(
      `Completed tasks:\n${memory.completedTasks.slice(-15).map((t) => `- ${t}`).join('\n')}`
    );
  }
  if (memory.architectureDecisions.length) {
    lines.push(
      `Architecture decisions:\n${memory.architectureDecisions
        .map((d) => `- ${d.summary}`)
        .join('\n')}`
    );
  }
  if (Object.keys(memory.conventions).length) {
    lines.push(`Coding conventions: ${JSON.stringify(memory.conventions)}`);
  }
  if (memory.librariesUsed.length) lines.push(`Libraries used: ${memory.librariesUsed.join(', ')}`);
  if (memory.dependencies.length) lines.push(`Dependencies: ${memory.dependencies.join(', ')}`);
  if (memory.buildCommands.length) lines.push(`Build commands: ${memory.buildCommands.join(' | ')}`);
  const openBugs = memory.errorsEncountered.filter((b) => !b.resolved);
  if (openBugs.length) {
    lines.push(`Unresolved bugs:\n${openBugs.map((b) => `- ${b.description}`).join('\n')}`);
  }
  if (memory.todoList.length) lines.push(`TODO:\n${memory.todoList.map((t) => `- ${t}`).join('\n')}`);
  if (Object.keys(memory.userPreferences).length) {
    lines.push(`User preferences: ${JSON.stringify(memory.userPreferences)}`);
  }
  if (memory.fileTree.length) {
    lines.push(`File tree:\n${memory.fileTree.map((f) => `- ${f}`).join('\n')}`);
  }
  if (memory.conversationSummary) {
    lines.push(`Prior conversation summary:\n${memory.conversationSummary}`);
  }
  return lines.join('\n\n');
}
