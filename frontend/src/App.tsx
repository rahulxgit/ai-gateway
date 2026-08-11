import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MessageBubble } from './components/MessageBubble';
import { Composer } from './components/Composer';
import { RoutingControls } from './components/RoutingControls';
import { HealthBar } from './components/HealthBar';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { api } from './lib/api';
import type { ChatMessage, ChatSession, ImageAttachment, ProjectMemory, ProviderName, TaskType } from './types';

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [taskType, setTaskType] = useState<TaskType>('general');
  const [forceProvider, setForceProvider] = useState<ProviderName | 'auto'>('auto');
  const [modelOverride, setModelOverride] = useState('');
  const [projects, setProjects] = useState<ProjectMemory[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectMemory | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  // Open by default on desktop/laptop (Claude-app default), closed by
  // default on mobile/tablet where it would otherwise cover the chat.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshSessions = () => {
    api.listSessions().then(setSessions).catch(() => {});
  };

  const refreshProjects = () => {
    api.listProjects().then(setProjects).catch(() => {});
  };

  useEffect(() => {
    refreshSessions();
    refreshProjects();
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

  const createProject = async (name: string, goal?: string) => {
    const project = await api.createProject(name, goal).catch(() => null);
    if (project) {
      setActiveProject(project);
      refreshProjects();
    }
  };

  const send = async (apiText: string, displayText: string, images?: ImageAttachment[], attachmentNames?: string[]) => {
    setError(null);
    // Store the clean, user-typed text for display — the full extracted
    // file dump (apiText) only ever goes to the backend/model, never
    // rendered in the chat bubble.
    const userMessage: ChatMessage = { role: 'user', content: displayText, images, attachmentNames };
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);

    try {
      const result = await api.sendChat({
        sessionId: activeSessionId ?? undefined,
        projectId: activeProject?.projectId,
        messages: [{ role: 'user', content: apiText, images }],
        taskType,
        forceProvider: forceProvider === 'auto' ? undefined : forceProvider,
        model: modelOverride || undefined,
        // Only coding tasks (long code/file output) need headroom above
        // the backend's own sane default (DEFAULT_MAX_TOKENS = 1024 in
        // openai-compatible.adapter.ts). Sending 64000 unconditionally on
        // every request — including a one-word "hi" — makes every
        // provider adapter reserve its full ceiling upfront via
        // Math.min(maxTokens ?? DEFAULT_MAX_TOKENS, this.maxOutputTokens),
        // which reintroduces the exact Groq TPM bug documented as bug #11
        // in PROJECT_OVERVIEW.md (a low-TPM provider 413s before
        // generating anything). Leaving maxTokens undefined for
        // non-coding tasks lets the backend's per-provider default
        // budget apply as intended; each provider still clamps up to its
        // own real ceiling if the caller does ask for more.
        maxTokens: taskType === 'coding' ? 64000 : undefined,
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
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-hairline bg-panel">
          {/* Mobile compact header: title, analytics, sidebar toggle */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 lg:hidden">
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={() => setSidebarOpen((o) => !o)}
                className={`shrink-0 rounded-md border p-2 transition ${
                  sidebarOpen ? 'border-signal-dim text-signal' : 'border-hairline text-ink-muted hover:text-ink'
                }`}
                aria-label="Toggle sidebar"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <span className="truncate font-mono text-xs font-semibold tracking-tight text-ink">
                {activeProject ? activeProject.name : 'AI GATEWAY'}
              </span>
            </div>
            <button
              onClick={() => setShowAnalytics(true)}
              className="shrink-0 rounded-md border border-hairline p-2 text-ink-muted transition hover:text-signal"
              aria-label="Analytics"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M4 20V10M12 20V4M20 20v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2 lg:hidden">
            <RoutingControls
              taskType={taskType}
              onTaskTypeChange={setTaskType}
              forceProvider={forceProvider}
              onForceProviderChange={setForceProvider}
              model={modelOverride}
              onModelChange={setModelOverride}
            />
            <HealthBar />
          </div>

          {/* Desktop/laptop header: everything inline, sidebar toggle on
              the far right to match its right-docked position (Claude-app
              convention). */}
          <div className="hidden flex-wrap items-center justify-between gap-y-2 px-5 py-3 lg:flex">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <button
                onClick={() => setSidebarOpen((o) => !o)}
                className={`shrink-0 rounded-md border p-1.5 transition ${
                  sidebarOpen ? 'border-signal-dim text-signal' : 'border-hairline text-ink-muted hover:text-ink'
                }`}
                aria-label="Toggle sidebar"
                title="Toggle sidebar (chats & projects)"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M9 4v16" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
              <span className="shrink-0 font-mono text-sm font-semibold tracking-tight text-ink">
                AI GATEWAY
              </span>
              {activeProject && (
                <>
                  <span className="text-ink-faint">/</span>
                  <span className="truncate text-sm text-ink-muted" title={activeProject.name}>
                    {activeProject.name}
                  </span>
                </>
              )}
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
            <div className="flex shrink-0 items-center gap-3">
              <HealthBar />
              <button
                onClick={() => setShowAnalytics(true)}
                className="rounded-md border border-hairline px-2.5 py-1 font-mono text-[12px] text-ink-muted transition hover:border-signal-dim hover:text-signal"
              >
                analytics
              </button>
            </div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3 py-5 md:px-6 md:py-6 lg:px-8">
          {/* Claude-style centered chat column: fixed max width regardless
              of how much horizontal room the viewport has, so the chat
              never stretches edge-to-edge on wide laptop/desktop screens. */}
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
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

        <div className="border-t border-hairline bg-canvas px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:py-4 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <Composer onSend={send} disabled={sending} projectId={activeProject?.projectId} />
          </div>
        </div>
      </div>

      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={selectSession}
        onNewChat={newChat}
        onDelete={deleteSession}
        projects={projects}
        activeProject={activeProject}
        onSelectProject={setActiveProject}
        onCreateProject={createProject}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {showAnalytics && <AnalyticsPanel onClose={() => setShowAnalytics(false)} />}
    </div>
  );
}
