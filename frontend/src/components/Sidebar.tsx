import type { ChatSession } from '../types';

export function Sidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNewChat,
  onDelete,
  open,
  onClose,
}: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop — mobile only, closes the drawer on tap outside it */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-72 shrink-0 flex-col border-r border-hairline bg-panel transition-transform duration-200 ease-out md:static md:z-auto md:w-64 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 p-3">
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
            className="rounded-md border border-hairline p-2 text-ink-muted transition hover:text-ink md:hidden"
            aria-label="Close sidebar"
          >
            ✕
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
                className="ml-2 shrink-0 text-ink-faint opacity-100 transition hover:text-danger md:opacity-0 md:group-hover:opacity-100"
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
    </>
  );
}
