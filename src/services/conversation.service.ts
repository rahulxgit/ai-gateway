import { v4 as uuid } from 'uuid';
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
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO messages (id, session_id, role, content, provider, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, sessionId, role, content, provider, model, now);
  touchSession(sessionId);
  return { id, sessionId, role, content, provider, model, createdAt: now };
}

export function saveIncomingMessages(sessionId: string, messages: ChatMessage[]): void {
  const insert = db.prepare(
    `INSERT INTO messages (id, session_id, role, content, provider, model, created_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?)`
  );
  const now = new Date().toISOString();
  const tx = db.transaction((msgs: ChatMessage[]) => {
    for (const m of msgs) insert.run(uuid(), sessionId, m.role, m.content, now);
  });
  tx(messages);
  touchSession(sessionId);
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
