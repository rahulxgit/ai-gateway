import { v4 as uuid } from 'uuid';
import { db } from '../database/client';
import { FileEdit, ProjectFile, ProviderName } from '../types';
import { getProjectMemory, updateProjectMemory } from './project-memory.service';

interface FileRow {
  project_id: string;
  path: string;
  content: string;
  language: string | null;
  version: number;
  updated_at: string;
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    py: 'python',
    sql: 'sql',
    yml: 'yaml',
    yaml: 'yaml',
  };
  return map[ext] ?? 'text';
}

function rowToFile(row: FileRow): ProjectFile {
  return {
    path: row.path,
    content: row.content,
    language: row.language ?? detectLanguage(row.path),
    version: row.version,
    updatedAt: row.updated_at,
  };
}

function refreshFileTree(projectId: string): void {
  const rows = db
    .prepare(`SELECT path FROM project_files WHERE project_id = ? ORDER BY path`)
    .all(projectId) as { path: string }[];
  updateProjectMemory(projectId, { fileTree: rows.map((r) => r.path) });
}

/**
 * Writes (creates or updates) a file, bumping its version and appending a
 * full-content snapshot to file_edits for undo/redo history. Every
 * generated or modified file must go through here so nothing the gateway
 * produces is ever lost, regardless of which provider wrote it.
 */
export function writeFile(
  projectId: string,
  filePath: string,
  content: string,
  provider: ProviderName | null,
  diffSummary = 'updated'
): ProjectFile {
  const now = new Date().toISOString();
  const existing = db
    .prepare(`SELECT * FROM project_files WHERE project_id = ? AND path = ?`)
    .get(projectId, filePath) as FileRow | undefined;
  const nextVersion = (existing?.version ?? 0) + 1;
  const language = detectLanguage(filePath);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO project_files (project_id, path, content, language, version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, path) DO UPDATE SET
         content = excluded.content, version = excluded.version, updated_at = excluded.updated_at`
    ).run(projectId, filePath, content, language, nextVersion, now);

    db.prepare(
      `INSERT INTO file_edits (id, project_id, path, content, diff_summary, provider, version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(uuid(), projectId, filePath, content, diffSummary, provider, nextVersion, now);
  });
  tx();

  refreshFileTree(projectId);

  const current = getProjectMemory(projectId);
  if (current) {
    const recentEdits: FileEdit[] = [
      { id: uuid(), path: filePath, diffSummary, provider, createdAt: now },
      ...current.recentEdits,
    ].slice(0, 30);
    updateProjectMemory(projectId, { recentEdits });
  }

  return { path: filePath, content, language, version: nextVersion, updatedAt: now };
}

export function getFile(projectId: string, filePath: string): ProjectFile | null {
  const row = db
    .prepare(`SELECT * FROM project_files WHERE project_id = ? AND path = ?`)
    .get(projectId, filePath) as FileRow | undefined;
  return row ? rowToFile(row) : null;
}

export function listFiles(projectId: string): ProjectFile[] {
  const rows = db
    .prepare(`SELECT * FROM project_files WHERE project_id = ? ORDER BY path`)
    .all(projectId) as FileRow[];
  return rows.map(rowToFile);
}

export function getFileHistory(projectId: string, filePath: string): FileEdit[] {
  interface EditRow {
    id: string;
    path: string;
    diff_summary: string;
    provider: ProviderName | null;
    created_at: string;
  }
  const rows = db
    .prepare(
      `SELECT id, path, diff_summary, provider, created_at FROM file_edits
       WHERE project_id = ? AND path = ? ORDER BY version DESC`
    )
    .all(projectId, filePath) as EditRow[];
  return rows.map((r) => ({
    id: r.id,
    path: r.path,
    diffSummary: r.diff_summary,
    provider: r.provider,
    createdAt: r.created_at,
  }));
}

/** Reverts a file to a specific prior version (undo), recorded as a new edit. */
export function revertFile(projectId: string, filePath: string, version: number): ProjectFile {
  const row = db
    .prepare(
      `SELECT content FROM file_edits WHERE project_id = ? AND path = ? AND version = ?`
    )
    .get(projectId, filePath, version) as { content: string } | undefined;
  if (!row) throw new Error(`No such version ${version} for ${filePath}`);
  return writeFile(projectId, filePath, row.content, null, `reverted to v${version}`);
}

export function deleteFile(projectId: string, filePath: string): void {
  db.prepare(`DELETE FROM project_files WHERE project_id = ? AND path = ?`).run(
    projectId,
    filePath
  );
  refreshFileTree(projectId);
}

// -- Snapshots ---------------------------------------------------------

export function createSnapshot(projectId: string, label: string): string {
  const memory = getProjectMemory(projectId);
  if (!memory) throw new Error(`Project not found: ${projectId}`);
  const files = listFiles(projectId);
  const id = uuid();
  db.prepare(
    `INSERT INTO project_snapshots (id, project_id, label, memory_json, files_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, projectId, label, JSON.stringify(memory), JSON.stringify(files), new Date().toISOString());
  return id;
}

export function listSnapshots(projectId: string) {
  return db
    .prepare(
      `SELECT id, label, created_at FROM project_snapshots WHERE project_id = ? ORDER BY created_at DESC`
    )
    .all(projectId) as { id: string; label: string; created_at: string }[];
}

/** Restores project memory + every file to the state captured in a snapshot. */
export function restoreSnapshot(projectId: string, snapshotId: string): void {
  const row = db
    .prepare(`SELECT memory_json, files_json FROM project_snapshots WHERE id = ? AND project_id = ?`)
    .get(snapshotId, projectId) as { memory_json: string; files_json: string } | undefined;
  if (!row) throw new Error(`Snapshot not found: ${snapshotId}`);

  const memory = JSON.parse(row.memory_json);
  const files: ProjectFile[] = JSON.parse(row.files_json);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE projects SET name = ?, goal = ?, current_task = ?, memory_json = ?, updated_at = ? WHERE id = ?`
    ).run(memory.name, memory.goal, memory.currentTask, JSON.stringify(memory), new Date().toISOString(), projectId);

    for (const f of files) {
      db.prepare(
        `INSERT INTO project_files (project_id, path, content, language, version, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id, path) DO UPDATE SET
           content = excluded.content, language = excluded.language,
           version = excluded.version, updated_at = excluded.updated_at`
      ).run(projectId, f.path, f.content, f.language ?? null, f.version, f.updatedAt);
    }
  });
  tx();
}

/**
 * Detects which project files are relevant to a task by simple keyword /
 * path matching against the task description and recent edits. Keeps
 * failover handoffs and ordinary requests within token limits by only
 * injecting files that plausibly matter, instead of the whole workspace.
 */
export function detectRelevantFiles(
  projectId: string,
  taskDescription: string,
  maxFiles = 8
): ProjectFile[] {
  const all = listFiles(projectId);
  if (all.length <= maxFiles) return all;

  const keywords = taskDescription
    .toLowerCase()
    .split(/[^a-z0-9_.]+/i)
    .filter((w) => w.length > 2);

  const scored = all.map((f) => {
    const haystack = f.path.toLowerCase();
    const score = keywords.reduce((acc, kw) => (haystack.includes(kw) ? acc + 1 : acc), 0);
    return { file: f, score };
  });

  scored.sort((a, b) => b.score - a.score || (b.file.updatedAt > a.file.updatedAt ? 1 : -1));

  const top = scored.filter((s) => s.score > 0).slice(0, maxFiles);
  if (top.length > 0) return top.map((s) => s.file);

  // No keyword matches — fall back to most recently touched files, since
  // those are most likely part of whatever the user is currently doing.
  return [...all].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, maxFiles);
}
