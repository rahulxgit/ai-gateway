import { runMigrations } from '../database/client';
import * as projectMemory from '../services/project-memory.service';
import * as workspace from '../services/workspace.service';
import { createSession, autoTitleSessionIfNeeded, listSessions } from '../services/conversation.service';

beforeAll(() => {
  runMigrations();
});

describe('project memory + workspace persistence', () => {
  it('creates a project with sensible empty defaults', () => {
    const project = projectMemory.createProject('Logic Looper', 'Daily puzzle platform');
    expect(project.name).toBe('Logic Looper');
    expect(project.pendingTasks).toEqual([]);
    expect(project.files).toEqual({});
  });

  it('tracks tasks moving from pending to completed', () => {
    const project = projectMemory.createProject('Task Tracker');
    projectMemory.addPendingTasks(project.projectId, ['build API', 'write tests']);
    const afterComplete = projectMemory.completeTask(project.projectId, 'build API');

    expect(afterComplete.pendingTasks).toEqual(['write tests']);
    expect(afterComplete.completedTasks).toEqual(['build API']);
  });

  it('versions files and preserves edit history for undo', () => {
    const project = projectMemory.createProject('Versioned Project');

    workspace.writeFile(project.projectId, 'src/a.ts', 'v1', 'gemini');
    workspace.writeFile(project.projectId, 'src/a.ts', 'v2', 'anthropic');
    const v3 = workspace.writeFile(project.projectId, 'src/a.ts', 'v3', 'groq');

    expect(v3.version).toBe(3);

    const history = workspace.getFileHistory(project.projectId, 'src/a.ts');
    expect(history).toHaveLength(3);
    expect(history[0].provider).toBe('groq'); // most recent first

    const reverted = workspace.revertFile(project.projectId, 'src/a.ts', 1);
    expect(reverted.content).toBe('v1');
    expect(reverted.version).toBe(4); // revert is recorded as a new version, not a rewrite
  });

  it('keeps the file tree on project memory in sync with workspace writes', () => {
    const project = projectMemory.createProject('Tree Sync');
    workspace.writeFile(project.projectId, 'src/index.ts', 'x', null);
    workspace.writeFile(project.projectId, 'src/utils.ts', 'y', null);

    const memory = projectMemory.getProjectMemory(project.projectId)!;
    expect(memory.fileTree.sort()).toEqual(['src/index.ts', 'src/utils.ts']);
  });

  it('captures and restores a full snapshot', () => {
    const project = projectMemory.createProject('Snapshot Project');
    workspace.writeFile(project.projectId, 'src/main.ts', 'before', null);
    projectMemory.recordArchitectureDecision(project.projectId, 'Use SQLite');

    const snapshotId = workspace.createSnapshot(project.projectId, 'checkpoint-1');

    workspace.writeFile(project.projectId, 'src/main.ts', 'after', null);
    projectMemory.recordArchitectureDecision(project.projectId, 'Switch to Postgres');

    workspace.restoreSnapshot(project.projectId, snapshotId);

    const restoredFile = workspace.getFile(project.projectId, 'src/main.ts');
    const restoredMemory = projectMemory.getProjectMemory(project.projectId)!;

    expect(restoredFile?.content).toBe('before');
    expect(restoredMemory.architectureDecisions).toHaveLength(1);
  });

  it('detects relevant files by keyword match against the task', () => {
    const project = projectMemory.createProject('Relevance Project');
    for (let i = 0; i < 12; i++) {
      workspace.writeFile(project.projectId, `src/module-${i}.ts`, `content ${i}`, null);
    }
    workspace.writeFile(project.projectId, 'src/auth-service.ts', 'auth logic', null);

    const relevant = workspace.detectRelevantFiles(project.projectId, 'fix bug in auth service', 5);
    expect(relevant.some((f) => f.path === 'src/auth-service.ts')).toBe(true);
    expect(relevant.length).toBeLessThanOrEqual(5);
  });
});

describe('session auto-titling', () => {
  it('renames a "New Chat" session from its first user message', () => {
    const session = createSession();
    expect(session.title).toBe('New Chat');

    autoTitleSessionIfNeeded(session.id, 'Design a database schema for streaks');

    const updated = listSessions().find((s) => s.id === session.id);
    expect(updated?.title).toBe('Design a database schema for streaks');
  });

  it('truncates long messages with an ellipsis', () => {
    const session = createSession();
    const longMessage = 'a'.repeat(100);

    autoTitleSessionIfNeeded(session.id, longMessage);

    const updated = listSessions().find((s) => s.id === session.id);
    expect(updated?.title.length).toBeLessThanOrEqual(49);
    expect(updated?.title.endsWith('…')).toBe(true);
  });

  it('does not overwrite a title that has already been set', () => {
    const session = createSession();
    autoTitleSessionIfNeeded(session.id, 'first message');
    autoTitleSessionIfNeeded(session.id, 'second message');

    const updated = listSessions().find((s) => s.id === session.id);
    expect(updated?.title).toBe('first message');
  });

  it('does not rename a session that already has a custom title', () => {
    const session = createSession('My Custom Title');
    autoTitleSessionIfNeeded(session.id, 'some message');

    const updated = listSessions().find((s) => s.id === session.id);
    expect(updated?.title).toBe('My Custom Title');
  });
});
