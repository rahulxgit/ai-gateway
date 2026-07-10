import type { ChatSession } from '../types';

export function Sidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNewChat,
  onDelete,
}: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-hairline bg-panel">
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-hairline bg-panel-raised px-3 py-2 text-sm font-medium text-ink transition hover:border-signal-dim hover:text-signal"
        >
          <span className="text-lg leading-none">+</span> New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-3">
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
            onClick={() => onSelect(s.id)}
          >
            <span className="truncate">{s.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
              className="ml-2 shrink-0 text-ink-faint opacity-0 transition hover:text-danger group-hover:opacity-100"
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
    </aside>
  );
}
