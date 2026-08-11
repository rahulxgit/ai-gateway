import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import { db } from '../database/client';
import { ChatMessage, ChatSession, ConversationRecord, ProviderName } from '../types';

interface SessionRow {
  id: string;
  title: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: ChatMessage['role'];
  content: string;
  provider: ProviderName | null;
  model: string | null;
  created_at: string;
}

function toSession(row: SessionRow): ChatSession {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toRecord(row: MessageRow): ConversationRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
  };
}

export function createSession(title = 'New Chat', projectId?: string): ChatSession {
  const now = new Date().toISOString();
  const id = uuid();
  db.prepare(
    `INSERT INTO sessions (id, title, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, title, projectId ?? null, now, now);
  return { id, title, createdAt: now, updatedAt: now };
}

export function getOrCreateSession(sessionId?: string): ChatSession {
  if (sessionId) {
    const row = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as
      | SessionRow
      | undefined;
    if (row) return toSession(row);
  }
  return createSession();
}

export function touchSession(sessionId: string): void {
  db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    sessionId
  );
}

export function listSessions(): ChatSession[] {
  const rows = db
    .prepare(`SELECT * FROM sessions ORDER BY updated_at DESC`)
    .all() as SessionRow[];
  return rows.map(toSession);
}

function truncateTitle(text: string, maxLen = 48): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > maxLen ? `${singleLine.slice(0, maxLen).trimEnd()}…` : singleLine;
}

/**
 * Renames a session from "New Chat" to a snippet of its first user message,
 * the first time a message is saved to it. Later messages never overwrite
 * the title, so it stays a stable label for the conversation.
 */
export function autoTitleSessionIfNeeded(sessionId: string, firstUserMessage: string): void {
  const row = db.prepare(`SELECT title FROM sessions WHERE id = ?`).get(sessionId) as
    | { title: string }
    | undefined;
  if (!row || row.title !== 'New Chat') return;
  db.prepare(`UPDATE sessions SET title = ? WHERE id = ?`).run(
    truncateTitle(firstUserMessage),
    sessionId
  );
}

export function deleteSession(sessionId: string): void {
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
}

// Persists every turn — system prompt, user message, and assistant
// response — tagged with the provider/model that produced it. This is the
// full audit trail the orchestrator replays after a provider switch.
export function saveMessage(
  sessionId: string,
  role: ChatMessage['role'],
  content: string,
  provider: ProviderName | null = null,
  model: string | null = null
): ConversationRecord {
  return saveMessages(sessionId, [{ role, content, provider, model }])[0];
}

// Batched variant of saveMessage for persisting several incoming turns at
// once (e.g. the user message(s) on a request). A single db.transaction
// wraps all inserts plus one touchSession update, instead of N separate
// INSERT+UPDATE round trips — meaningfully cheaper for multi-message
// requests and avoids recompiling the prepared statement on every call.
// Lazily prepared (not at module load time) since migrations may not have
// run yet when this module is first imported — tests in particular import
// services before calling runMigrations() in beforeAll. Cached after first
// use so repeated calls still avoid recompiling the statement.
let insertMessageStmt: Database.Statement | null = null;
let touchSessionStmt: Database.Statement | null = null;

export function saveMessages(
  sessionId: string,
  messages: { role: ChatMessage['role']; content: string; provider?: ProviderName | null; model?: string | null }[]
): ConversationRecord[] {
  if (messages.length === 0) return [];
  insertMessageStmt ??= db.prepare(
    `INSERT INTO messages (id, session_id, role, content, provider, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  touchSessionStmt ??= db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`);

  const now = new Date().toISOString();
  const records: ConversationRecord[] = [];

  const tx = db.transaction(() => {
    for (const m of messages) {
      const id = uuid();
      const provider = m.provider ?? null;
      const model = m.model ?? null;
      insertMessageStmt!.run(id, sessionId, m.role, m.content, provider, model, now);
      records.push({ id, sessionId, role: m.role, content: m.content, provider, model, createdAt: now });
    }
    touchSessionStmt!.run(now, sessionId);
  });
  tx();

  return records;
}

export function getSessionHistory(sessionId: string, limit?: number): ConversationRecord[] {
  const rows = limit
    ? (db
        .prepare(
          `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`
        )
        .all(sessionId, limit) as MessageRow[])
        .reverse()
    : (db
        .prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`)
        .all(sessionId) as MessageRow[]);
  return rows.map(toRecord);
}

export function historyAsChatMessages(sessionId: string, limit?: number): ChatMessage[] {
  return getSessionHistory(sessionId, limit).map((r) => ({ role: r.role, content: r.content }));
}

export function estimateSessionTokenCount(sessionId: string): number {
  const row = db
    .prepare(`SELECT COALESCE(SUM(LENGTH(content)), 0) as chars FROM messages WHERE session_id = ?`)
    .get(sessionId) as { chars: number };
  // ~4 chars/token heuristic, good enough for deciding when to compress
  return Math.ceil(row.chars / 4);
}
