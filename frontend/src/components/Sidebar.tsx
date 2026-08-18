import { useMemo, useState } from 'react';
import type { ChatSession, ProjectMemory } from '../types';

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
  const [search, setSearch] = useState('');

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => session.title.toLowerCase().includes(query));
  }, [search, sessions]);

  const submitNewProject = () => {
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName.trim(), newProjectGoal.trim() || undefined);
    setNewProjectName('');
    setNewProjectGoal('');
    setCreatingProject(false);
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px] lg:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 h-full shrink-0 border-r border-hairline/80 bg-panel/95 shadow-2xl transition-transform duration-200 ease-out backdrop-blur-xl
          lg:relative lg:z-auto lg:order-first lg:h-auto lg:translate-x-0 lg:shadow-none lg:transition-[width,opacity]
          ${open ? 'translate-x-0' : '-translate-x-full'}
          ${open ? 'lg:w-64 lg:opacity-100' : 'lg:w-0 lg:overflow-hidden lg:opacity-0 lg:border-r-0'}
        `}
      >
        <div className="flex h-full w-[85vw] max-w-[300px] flex-col lg:w-64">
          <div className="flex items-center gap-2 border-b border-hairline/80 p-3">
            <button
              type="button"
              onClick={() => {
                onNewChat();
                onClose();
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-signal-dim/60 bg-signal/10 px-3 py-2.5 text-sm font-semibold text-signal shadow-sm transition duration-150 ease-out hover:bg-signal/15 hover:shadow-md active:scale-[0.98]"
            >
              <span className="text-lg leading-none">+</span>
              New chat
            </button>
            <button
              type="button"
              onClick={onClose}
              className="icon-button"
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 3v18M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="border-b border-hairline/80 px-3 py-2.5">
            <label className="relative block">
              <span className="sr-only">Search conversations</span>
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
                <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats"
                className="w-full rounded-xl border border-hairline bg-panel-raised/70 py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint outline-none transition focus:border-signal-dim focus:bg-panel-raised"
              />
            </label>
          </div>

          <div className="border-b border-hairline/80 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Projects</h2>
                <p className="mt-0.5 text-[11px] text-ink-faint">Persistent context and files</p>
              </div>
              <button
                type="button"
                onClick={() => setCreatingProject((c) => !c)}
                className="rounded-lg border border-hairline px-2 py-1 text-ink-muted transition hover:border-signal-dim hover:text-signal"
                aria-label="New project"
                title="New project"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={() => onSelectProject(null)}
              className={`mb-1.5 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition ${
                !activeProject ? 'bg-panel-raised text-ink shadow-sm' : 'text-ink-muted hover:bg-panel-raised/70 hover:text-ink'
              }`}
            >
              <span className="h-2 w-2 rounded-full border border-ink-faint" />
              <span className="truncate">No project</span>
            </button>

            <div className="max-h-44 space-y-1 overflow-y-auto scrollbar-thin">
              {projects.map((project) => (
                <button
                  type="button"
                  key={project.projectId}
                  onClick={() => onSelectProject(project)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition ${
                    activeProject?.projectId === project.projectId
                      ? 'bg-panel-raised text-signal shadow-sm'
                      : 'text-ink-muted hover:bg-panel-raised/70 hover:text-ink'
                  }`}
                  title={project.name}
                >
                  <span className={`h-2 w-2 rounded-full ${activeProject?.projectId === project.projectId ? 'bg-signal' : 'bg-ink-faint'}`} />
                  <span className="truncate">{project.name}</span>
                </button>
              ))}
              {projects.length === 0 && !creatingProject && (
                <p className="px-3 py-2 text-[11px] text-ink-faint">Create a project to keep context across chats.</p>
              )}
            </div>

            {creatingProject && (
              <div className="mt-3 space-y-2 rounded-xl border border-hairline bg-panel-raised/50 p-2.5">
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  className="w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-signal-dim"
                />
                <input
                  value={newProjectGoal}
                  onChange={(e) => setNewProjectGoal(e.target.value)}
                  placeholder="Goal (optional)"
                  onKeyDown={(e) => e.key === 'Enter' && submitNewProject()}
                  className="w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-signal-dim"
                />
                <button
                  type="button"
                  onClick={submitNewProject}
                  disabled={!newProjectName.trim()}
                  className="w-full rounded-lg bg-signal px-3 py-2 text-sm font-semibold text-canvas transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-panel disabled:text-ink-faint"
                >
                  Create project
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3 pt-3.5">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Conversations</h2>
              <span className="font-mono text-[10px] text-ink-faint">{filteredSessions.length}</span>
            </div>

            {filteredSessions.length === 0 && (
              <div className="rounded-xl border border-dashed border-hairline bg-panel-raised/30 px-3 py-5 text-center">
                <p className="text-xs text-ink-faint">{search ? 'No matching conversations.' : 'No conversations yet.'}</p>
                {!search && <button type="button" onClick={onNewChat} className="mt-2 text-xs font-medium text-signal hover:underline">Start your first chat</button>}
              </div>
            )}

            {filteredSessions.map((session) => (
              <div
                key={session.id}
                className={`group mb-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition ${
                  session.id === activeSessionId
                    ? 'bg-panel-raised text-ink ring-1 ring-inset ring-hairline'
                    : 'text-ink-muted hover:bg-panel-raised/70 hover:text-ink'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(session.id);
                    onClose();
                  }}
                  className="min-w-0 flex-1 truncate text-left"
                >
                  {session.title}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(session.id)}
                  className="shrink-0 rounded-md px-1.5 py-1 text-ink-faint opacity-100 transition hover:bg-danger/10 hover:text-danger lg:opacity-0 lg:group-hover:opacity-100"
                  aria-label={`Delete ${session.title}`}
                  title="Delete conversation"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-hairline/80 px-3 py-2.5 font-mono text-[10px] text-ink-faint">
            <div className="flex items-center justify-between">
              <span>AI Gateway</span>
              <span className="text-ok">● operational</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
