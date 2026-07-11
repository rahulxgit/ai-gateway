import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MessageBubble } from './components/MessageBubble';
import { Composer } from './components/Composer';
import { RoutingControls } from './components/RoutingControls';
import { HealthBar } from './components/HealthBar';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { ProjectSwitcher } from './components/ProjectSwitcher';
import { api } from './lib/api';
import type { ChatMessage, ChatSession, ImageAttachment, ProjectMemory, ProviderName, TaskType } from './types';

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [taskType, setTaskType] = useState<TaskType>('general');
  const [forceProvider, setForceProvider] = useState<ProviderName | 'auto'>('auto');
  const [modelOverride, setModelOverride] = useState('');
  const [activeProject, setActiveProject] = useState<ProjectMemory | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshSessions = () => {
    api.listSessions().then(setSessions).catch(() => {});
  };

  useEffect(() => {
    refreshSessions();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const selectSession = async (id: string) => {
    setActiveSessionId(id);
    setError(null);
    try {
      const history = await api.getSessionMessages(id);
      setMessages(
        history
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content, provider: m.provider, model: m.model }))
      );
    } catch {
      setMessages([]);
    }
  };

  const newChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setError(null);
  };

  const deleteSession = async (id: string) => {
    await api.deleteSession(id).catch(() => {});
    if (id === activeSessionId) newChat();
    refreshSessions();
  };

  const send = async (text: string, images?: ImageAttachment[]) => {
    setError(null);
    const userMessage: ChatMessage = { role: 'user', content: text, images };
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);

    try {
      const result = await api.sendChat({
        sessionId: activeSessionId ?? undefined,
        projectId: activeProject?.projectId,
        messages: [{ role: 'user', content: text, images }],
        taskType,
        forceProvider: forceProvider === 'auto' ? undefined : forceProvider,
        model: modelOverride || undefined,
      });

      if (!activeSessionId) {
        setActiveSessionId(result.sessionId);
        refreshSessions();
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.content,
          provider: result.provider,
          model: result.model,
          failoverChain: result.failoverChain,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[100dvh] bg-canvas text-ink overflow-hidden">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={selectSession}
        onNewChat={newChat}
        onDelete={deleteSession}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-hairline bg-panel">
          {/* Mobile compact header: hamburger, title, settings toggle, analytics */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 md:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md border border-hairline p-2 text-ink-muted transition hover:text-ink"
              aria-label="Open menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <span className="truncate font-mono text-xs font-semibold tracking-tight text-ink">
              {activeProject ? activeProject.name : 'AI GATEWAY'}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowAnalytics(true)}
                className="rounded-md border border-hairline p-2 text-ink-muted transition hover:text-signal"
                aria-label="Analytics"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M4 20V10M12 20V4M20 20v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <button
                onClick={() => setMobileControlsOpen((o) => !o)}
                className={`rounded-md border p-2 transition ${
                  mobileControlsOpen ? 'border-signal-dim text-signal' : 'border-hairline text-ink-muted hover:text-ink'
                }`}
                aria-label="Routing settings"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          {mobileControlsOpen && (
            <div className="flex flex-col gap-2 border-t border-hairline px-3 py-3 md:hidden">
              <ProjectSwitcher activeProject={activeProject} onSelect={setActiveProject} />
              <RoutingControls
                taskType={taskType}
                onTaskTypeChange={setTaskType}
                forceProvider={forceProvider}
                onForceProviderChange={setForceProvider}
                model={modelOverride}
                onModelChange={setModelOverride}
              />
              <div className="overflow-x-auto scrollbar-thin pb-1">
                <HealthBar />
              </div>
            </div>
          )}

          {/* Desktop header: everything inline, as before */}
          <div className="hidden flex-wrap items-center justify-between gap-y-2 px-5 py-3 md:flex">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm font-semibold tracking-tight text-ink">
                AI GATEWAY
              </span>
              <span className="text-ink-faint">/</span>
              <ProjectSwitcher activeProject={activeProject} onSelect={setActiveProject} />
              <span className="text-ink-faint">/</span>
              <RoutingControls
                taskType={taskType}
                onTaskTypeChange={setTaskType}
                forceProvider={forceProvider}
                onForceProviderChange={setForceProvider}
                model={modelOverride}
                onModelChange={setModelOverride}
              />
            </div>
            <div className="flex items-center gap-4">
              <HealthBar />
              <button
                onClick={() => setShowAnalytics(true)}
                className="rounded-md border border-hairline px-2.5 py-1 font-mono text-[11px] text-ink-muted transition hover:border-signal-dim hover:text-signal"
              >
                analytics
              </button>
            </div>
          </div>
        </header>

        {activeProject && (
          <div className="flex items-center gap-2 overflow-x-auto border-b border-hairline bg-panel/60 px-3 py-1.5 font-mono text-[11px] text-ink-faint md:px-5">
            <span className="shrink-0 text-ok">●</span>
            <span className="shrink-0">working in project</span>
            <span className="shrink-0 text-ink-muted">{activeProject.name}</span>
            {activeProject.goal && <span className="truncate">· {activeProject.goal}</span>}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3 py-5 md:px-5 md:py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.length === 0 && (
              <div className="flex h-[55vh] flex-col items-center justify-center text-center md:h-[60vh]">
                <div className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-faint">
                  route · retry · failover
                </div>
                <h1 className="max-w-md text-xl font-semibold text-ink md:text-2xl">
                  One assistant, many providers behind it.
                </h1>
                <p className="mt-2 max-w-sm text-sm text-ink-muted">
                  Ask anything, or attach a PDF/DOCX to work on. If a provider is rate-limited
                  or down, the gateway switches automatically — you'll never see it happen.
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}

            {sending && (
              <div className="flex items-center gap-2 pl-1 font-mono text-xs text-ink-faint">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal" />
                routing…
              </div>
            )}

            {error && (
              <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-hairline bg-canvas px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5 md:py-4">
          <div className="mx-auto max-w-3xl">
            <Composer onSend={send} disabled={sending} projectId={activeProject?.projectId} />
          </div>
        </div>
      </div>

      {showAnalytics && <AnalyticsPanel onClose={() => setShowAnalytics(false)} />}
    </div>
  );
}
