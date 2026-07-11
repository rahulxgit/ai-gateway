import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { ProjectMemory } from '../types';

export function ProjectSwitcher({
  activeProject,
  onSelect,
}: {
  activeProject: ProjectMemory | null;
  onSelect: (project: ProjectMemory | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectMemory[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const refresh = () => {
    api.listProjects().then(setProjects).catch(() => {});
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const project = await api.createProject(newName.trim(), newGoal.trim() || undefined);
    setNewName('');
    setNewGoal('');
    setCreating(false);
    onSelect(project);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-hairline bg-panel-raised px-2 py-1 font-mono text-[11px] text-ink-muted transition hover:text-ink"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-ok" style={{ opacity: activeProject ? 1 : 0.25 }} />
        {activeProject ? activeProject.name : 'no project'}
        <svg width="10" height="10" viewBox="0 0 10 10" className="opacity-60">
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-72 max-w-[90vw] rounded-lg border border-hairline bg-panel-raised p-1.5 shadow-xl">
          <button
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
            className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm transition hover:bg-panel ${
              !activeProject ? 'text-signal' : 'text-ink-muted'
            }`}
          >
            No project (plain chat)
          </button>

          <div className="my-1 border-t border-hairline" />

          <div className="max-h-52 overflow-y-auto scrollbar-thin">
            {projects.map((p) => (
              <button
                key={p.projectId}
                onClick={() => {
                  onSelect(p);
                  setOpen(false);
                }}
                className={`w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm transition hover:bg-panel ${
                  activeProject?.projectId === p.projectId ? 'text-signal' : 'text-ink'
                }`}
              >
                {p.name}
              </button>
            ))}
            {projects.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-ink-faint">No projects yet.</p>
            )}
          </div>

          <div className="my-1 border-t border-hairline" />

          {!creating ? (
            <button
              onClick={() => setCreating(true)}
              className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink-muted transition hover:bg-panel hover:text-signal"
            >
              + New project
            </button>
          ) : (
            <div className="space-y-1.5 p-1.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Project name"
                className="w-full rounded-md border border-hairline bg-panel px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-signal-dim"
              />
              <input
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                placeholder="Goal (optional)"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                className="w-full rounded-md border border-hairline bg-panel px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-signal-dim"
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="w-full rounded-md bg-signal px-2 py-1.5 text-sm font-medium text-canvas transition disabled:cursor-not-allowed disabled:bg-panel disabled:text-ink-faint"
              >
                Create
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
