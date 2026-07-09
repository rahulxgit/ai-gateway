import { v4 as uuid } from 'uuid';
import { db } from '../database/client';
import { CodingConventions, ProjectMemory } from '../types';

interface ProjectRow {
  id: string;
  name: string;
  goal: string;
  current_task: string | null;
  memory_json: string;
  created_at: string;
  updated_at: string;
}

function emptyMemory(id: string, name: string, goal: string, now: string): ProjectMemory {
  return {
    projectId: id,
    name,
    goal,
    currentTask: null,
    completedTasks: [],
    pendingTasks: [],
    fileTree: [],
    files: {},
    recentEdits: [],
    architectureDecisions: [],
    conventions: {},
    librariesUsed: [],
    frameworkVersions: {},
    buildCommands: [],
    dependencies: [],
    todoList: [],
    errorsEncountered: [],
    commitSummaries: [],
    userPreferences: {},
    conversationSummary: null,
    createdAt: now,
    updatedAt: now,
  };
}

function rowToMemory(row: ProjectRow): ProjectMemory {
  return JSON.parse(row.memory_json) as ProjectMemory;
}

export function createProject(name: string, goal = ''): ProjectMemory {
  const now = new Date().toISOString();
  const id = uuid();
  const memory = emptyMemory(id, name, goal, now);
  db.prepare(
    `INSERT INTO projects (id, name, goal, current_task, memory_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, goal, null, JSON.stringify(memory), now, now);
  return memory;
}

export function getProjectMemory(projectId: string): ProjectMemory | null {
  const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) as
    | ProjectRow
    | undefined;
  return row ? rowToMemory(row) : null;
}

export function listProjects(): ProjectMemory[] {
  const rows = db.prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all() as ProjectRow[];
  return rows.map(rowToMemory);
}

function persist(memory: ProjectMemory): ProjectMemory {
  memory.updatedAt = new Date().toISOString();
  db.prepare(
    `UPDATE projects SET name = ?, goal = ?, current_task = ?, memory_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    memory.name,
    memory.goal,
    memory.currentTask,
    JSON.stringify(memory),
    memory.updatedAt,
    memory.projectId
  );
  return memory;
}

// Generic partial-update helper — every mutator below reads current memory,
// applies a patch, and writes it back atomically-ish (single UPDATE).
export function updateProjectMemory(
  projectId: string,
  patch: Partial<Omit<ProjectMemory, 'projectId' | 'createdAt'>>
): ProjectMemory {
  const current = getProjectMemory(projectId);
  if (!current) throw new Error(`Project not found: ${projectId}`);
  const updated: ProjectMemory = { ...current, ...patch };
  return persist(updated);
}

export function setCurrentTask(projectId: string, task: string): ProjectMemory {
  return updateProjectMemory(projectId, { currentTask: task });
}

export function completeTask(projectId: string, task: string): ProjectMemory {
  const current = getProjectMemory(projectId);
  if (!current) throw new Error(`Project not found: ${projectId}`);
  return updateProjectMemory(projectId, {
    completedTasks: [...current.completedTasks, task],
    pendingTasks: current.pendingTasks.filter((t) => t !== task),
    currentTask: current.currentTask === task ? null : current.currentTask,
  });
}

export function addPendingTasks(projectId: string, tasks: string[]): ProjectMemory {
  const current = getProjectMemory(projectId);
  if (!current) throw new Error(`Project not found: ${projectId}`);
  const merged = Array.from(new Set([...current.pendingTasks, ...tasks]));
  return updateProjectMemory(projectId, { pendingTasks: merged });
}

export function recordArchitectureDecision(projectId: string, summary: string): ProjectMemory {
  const current = getProjectMemory(projectId);
  if (!current) throw new Error(`Project not found: ${projectId}`);
  return updateProjectMemory(projectId, {
    architectureDecisions: [
      ...current.architectureDecisions,
      { id: uuid(), summary, createdAt: new Date().toISOString() },
    ],
  });
}

export function recordBug(projectId: string, description: string): ProjectMemory {
  const current = getProjectMemory(projectId);
  if (!current) throw new Error(`Project not found: ${projectId}`);
  return updateProjectMemory(projectId, {
    errorsEncountered: [
      ...current.errorsEncountered,
      { id: uuid(), description, resolved: false, createdAt: new Date().toISOString() },
    ],
  });
}

export function resolveBug(projectId: string, bugId: string, fix: string): ProjectMemory {
  const current = getProjectMemory(projectId);
  if (!current) throw new Error(`Project not found: ${projectId}`);
  return updateProjectMemory(projectId, {
    errorsEncountered: current.errorsEncountered.map((b) =>
      b.id === bugId ? { ...b, resolved: true, fix } : b
    ),
  });
}

export function recordCommit(projectId: string, message: string): ProjectMemory {
  const current = getProjectMemory(projectId);
  if (!current) throw new Error(`Project not found: ${projectId}`);
  return updateProjectMemory(projectId, {
    commitSummaries: [
      ...current.commitSummaries,
      { id: uuid(), message, createdAt: new Date().toISOString() },
    ],
  });
}

export function setConventions(projectId: string, conventions: CodingConventions): ProjectMemory {
  const current = getProjectMemory(projectId);
  if (!current) throw new Error(`Project not found: ${projectId}`);
  return updateProjectMemory(projectId, {
    conventions: { ...current.conventions, ...conventions },
  });
}

export function setUserPreference(projectId: string, key: string, value: string): ProjectMemory {
  const current = getProjectMemory(projectId);
  if (!current) throw new Error(`Project not found: ${projectId}`);
  return updateProjectMemory(projectId, {
    userPreferences: { ...current.userPreferences, [key]: value },
  });
}

export function setConversationSummary(projectId: string, summary: string): ProjectMemory {
  return updateProjectMemory(projectId, { conversationSummary: summary });
}
