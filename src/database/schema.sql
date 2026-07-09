-- ---------------------------------------------------------------------------
-- AI Gateway schema. SQLite (better-sqlite3), file-based, zero external deps.
-- Swap-friendly: services/database.service.ts is the only place that knows
-- this is SQLite — move to Postgres later by reimplementing that file.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Chat',
  project_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Conversation memory: every system/user/assistant turn, tagged with which
-- provider+model actually produced it. This is what gets replayed to a new
-- provider after a failover so context is never lost.
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
  content TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

-- Project memory: one row per project, JSON blob for the flexible/nested
-- fields (tasks, conventions, decisions, etc.), indexed columns for the
-- fields we filter/sort on directly.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  current_task TEXT,
  memory_json TEXT NOT NULL, -- serialized ProjectMemory (tasks, conventions, decisions, etc.)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Workspace files: latest version of every file, plus a version counter.
-- Full history lives in file_edits below.
CREATE TABLE IF NOT EXISTS project_files (
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, path),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Full edit history per file, enabling undo/redo and snapshots.
CREATE TABLE IF NOT EXISTS file_edits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL, -- full content at this version (simple, robust undo)
  diff_summary TEXT NOT NULL DEFAULT '',
  provider TEXT,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_file_edits_lookup ON file_edits(project_id, path, version);

-- Named snapshots of full project memory + file state, for restore/rollback.
CREATE TABLE IF NOT EXISTS project_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  label TEXT NOT NULL,
  memory_json TEXT NOT NULL,
  files_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analytics (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  task_type TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL,
  error_code TEXT,
  failover_from TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_provider ON analytics(provider);
