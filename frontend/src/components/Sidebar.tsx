import { useState } from 'react';
import type { ChatSession, ProjectMemory } from '../types';

/**
 * Right-docked sidebar (Claude-app style): overlays on mobile, collapses to
 * zero width in the normal flex flow on desktop instead of always taking up
 * space. Holds both chat sessions and projects — projects used to live in a
 * separate header dropdown (ProjectSwitcher); folding it in here keeps
 * "everything about where you are" in one panel instead of split across the
 * header and a popover.
 */
export function Sidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNewChat,
  onDelete,
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  open,
  onClose,
}: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  projects: ProjectMemory[];
  activeProject: ProjectMemory | null;
  onSelectProject: (project: ProjectMemory | null) => void;
  onCreateProject: (name: string, goal?: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectGoal, setNewProjectGoal] = useState('');

  const submitNewProject = () => {
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName.trim(), newProjectGoal.trim() || undefined);
    setNewProjectName('');
    setNewProjectGoal('');
    setCreatingProject(false);
  };

  return (
    <>
      {/* Backdrop — mobile/tablet only, closes the drawer on tap outside it */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-40 h-full shrink-0 border-l border-hairline bg-panel
          transition-transform duration-200 ease-out
          lg:relative lg:z-auto lg:h-auto lg:translate-x-0 lg:transition-[width,opacity] lg:duration-200
          ${open ? 'translate-x-0' : 'translate-x-full'}
          ${open ? 'lg:w-72 lg:opacity-100' : 'lg:w-0 lg:overflow-hidden lg:opacity-0 lg:border-l-0'}
        `}
      >
        <div className="flex h-full w-[85vw] max-w-80 flex-col lg:w-72">
          <div className="flex items-center gap-2 border-b border-hairline p-3">
            <button
              onClick={() => {
                onNewChat();
                onClose();
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-md border border-hairline bg-panel-raised px-3 py-2 text-sm font-medium text-ink transition hover:border-signal-dim hover:text-signal"
            >
              <span className="text-lg leading-none">+</span> New chat
            </button>
            <button
              onClick={onClose}
              className="shrink-0 rounded-md border border-hairline p-2 text-ink-muted transition hover:text-ink"
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 3v18M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Projects */}
          <div className="border-b border-hairline p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">Projects</h2>
              <button
                onClick={() => setCreatingProject((c) => !c)}
                className="rounded px-1.5 py-0.5 text-ink-faint transition hover:text-signal"
                aria-label="New project"
                title="New project"
              >
                +
              </button>
            </div>

            <button
              onClick={() => onSelectProject(null)}
              className={`mb-0.5 w-full truncate rounded-md px-2.5 py-1.5 text-left text-[13px] transition ${
                !activeProject ? 'bg-panel-raised text-ink' : 'text-ink-muted hover:bg-panel-raised/60 hover:text-ink'
              }`}
            >
              No project (plain chat)
            </button>

            <div className="max-h-40 overflow-y-auto scrollbar-thin">
              {projects.map((p) => (
                <button
                  key={p.projectId}
                  onClick={() => onSelectProject(p)}
                  className={`mb-0.5 w-full truncate rounded-md px-2.5 py-1.5 text-left text-[13px] transition ${
                    activeProject?.projectId === p.projectId
                      ? 'bg-panel-raised text-signal'
                      : 'text-ink-muted hover:bg-panel-raised/60 hover:text-ink'
                  }`}
                  title={p.name}
                >
                  {p.name}
                </button>
              ))}
              {projects.length === 0 && !creatingProject && (
                <p className="px-2.5 py-1 text-[11px] text-ink-faint">No projects yet.</p>
              )}
            </div>

            {creatingProject && (
              <div className="mt-2 space-y-1.5">
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  className="w-full rounded-md border border-hairline bg-panel-raised px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-signal-dim"
                />
                <input
                  value={newProjectGoal}
                  onChange={(e) => setNewProjectGoal(e.target.value)}
                  placeholder="Goal (optional)"
                  onKeyDown={(e) => e.key === 'Enter' && submitNewProject()}
                  className="w-full rounded-md border border-hairline bg-panel-raised px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-signal-dim"
                />
                <button
                  onClick={submitNewProject}
                  disabled={!newProjectName.trim()}
                  className="w-full rounded-md bg-signal px-2 py-1.5 text-sm font-medium text-canvas transition disabled:cursor-not-allowed disabled:bg-panel-raised disabled:text-ink-faint"
                >
                  Create
                </button>
              </div>
            )}
          </div>

          {/* Chats */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3 pt-3">
            <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-ink-faint">Chats</h2>
            {sessions.length === 0 && (
              <p className="px-2 py-4 text-xs text-ink-faint">No conversations yet.</p>
            )}
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`group mb-0.5 flex items-center justify-between rounded-md px-2.5 py-2 text-sm cursor-pointer transition ${
                  s.id === activeSessionId
                    ? 'bg-panel-raised text-ink'
                    : 'text-ink-muted hover:bg-panel-raised/60 hover:text-ink'
                }`}
                onClick={() => {
                  onSelect(s.id);
                  onClose();
                }}
              >
                <span className="truncate">{s.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                  className="ml-2 shrink-0 text-ink-faint opacity-100 transition hover:text-danger lg:opacity-0 lg:group-hover:opacity-100"
                  aria-label="Delete session"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-hairline p-3 font-mono text-[10px] text-ink-faint">
            AI Gateway · multi-LLM router
          </div>
        </div>
      </aside>
    </>
  );
}
