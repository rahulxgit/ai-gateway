import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MessageBubble } from './components/MessageBubble';
import { Composer } from './components/Composer';
import { RoutingControls } from './components/RoutingControls';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { api } from './lib/api';
import type { ChatMessage, ChatSession, ImageAttachment, ProjectMemory, ProviderName, TaskType } from './types';

const STARTER_PROMPTS = [
  'Review my code and suggest production improvements',
  'Explain a complex technical topic clearly',
  'Help me debug an error step by step',
];

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [taskType, setTaskType] = useState<TaskType>('general');
  const [forceProvider, setForceProvider] = useState<ProviderName | 'auto'>('auto');
  const [modelOverride, setModelOverride] = useState('');
  const [freeOnly, setFreeOnly] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('freeOnly');
    return stored === null ? true : stored === 'true';
  });
  const [projects, setProjects] = useState<ProjectMemory[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectMemory | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

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
    window.localStorage.setItem('freeOnly', String(freeOnly));
  }, [freeOnly]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

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
      setError('Could not load this conversation.');
    }
  };

  const newChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setError(null);
    requestAnimationFrame(() => composerRef.current?.querySelector('textarea')?.focus());
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
        maxTokens: taskType === 'coding' ? 64000 : undefined,
        freeOnly: forceProvider === 'auto' ? freeOnly : undefined,
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
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-canvas text-ink selection:bg-signal-dim/40">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-hairline/80 bg-canvas/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-3 py-3 md:px-5 lg:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setSidebarOpen((o) => !o)}
                className={`icon-button ${sidebarOpen ? 'icon-button-active' : ''}`}
                aria-label="Toggle conversations sidebar"
                aria-expanded={sidebarOpen}
                title="Chats & projects"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M9 4v16" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
              <div className="min-w-0 flex items-center gap-2 lg:hidden">
                <RoutingControls
                  taskType={taskType}
                  onTaskTypeChange={setTaskType}
                  forceProvider={forceProvider}
                  onForceProviderChange={setForceProvider}
                  model={modelOverride}
                  onModelChange={setModelOverride}
                  freeOnly={freeOnly}
                  onFreeOnlyChange={setFreeOnly}
                  compact
                />
              </div>
            </div>

            <div className="hidden items-center gap-2 lg:flex">
              <RoutingControls
                taskType={taskType}
                onTaskTypeChange={setTaskType}
                forceProvider={forceProvider}
                onForceProviderChange={setForceProvider}
                model={modelOverride}
                onModelChange={setModelOverride}
                freeOnly={freeOnly}
                onFreeOnlyChange={setFreeOnly}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAnalytics(true)}
                className="rounded-lg border border-hairline bg-panel/70 px-3 py-1.5 font-mono text-[11px] text-ink-muted transition duration-150 hover:border-signal-dim hover:bg-panel hover:text-ink hover:shadow-sm"
              >
                analytics
              </button>
            </div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3 py-6 md:px-6 md:py-8 lg:px-8">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            {messages.length === 0 && (
              <section className="relative overflow-hidden rounded-3xl border border-hairline bg-panel/55 px-5 py-10 shadow-floating md:px-10 md:py-14">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(240,163,57,0.10),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(79,209,174,0.08),transparent_35%)]" />
                <div className="relative mx-auto max-w-2xl text-center">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-signal-dim/50 bg-gradient-to-br from-signal/20 to-signal/5 font-mono text-sm font-semibold text-signal shadow-[0_0_30px_rgba(240,163,57,0.12)]">
                    AG
                  </div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-faint">route · retry · failover</p>
                  <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink md:text-4xl">
                    One interface. Multiple models. Built for reliability.
                  </h1>
                  <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink-muted md:text-base">
                    Ask a question, attach a document or image, and let the gateway choose the best configured provider—switching automatically when a provider is slow, rate-limited, or unavailable.
                  </p>

                  <div className="mt-7 grid gap-2.5 text-left sm:grid-cols-3">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          requestAnimationFrame(() => {
                            const textarea = composerRef.current?.querySelector('textarea');
                            if (textarea) {
                              const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
                              setter?.call(textarea, prompt);
                              textarea.dispatchEvent(new Event('input', { bubbles: true }));
                              textarea.focus();
                            }
                          });
                        }}
                        className="rounded-2xl border border-hairline bg-panel-raised/55 px-3.5 py-3 text-left text-xs leading-5 text-ink-muted shadow-sm transition duration-150 ease-out hover:-translate-y-0.5 hover:border-signal-dim hover:bg-panel-raised hover:text-ink hover:shadow-panel"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {messages.map((m, i) => (
              <MessageBubble key={`${activeSessionId ?? 'new'}-${i}`} message={m} />
            ))}

            {sending && (
              <div className="flex items-center gap-3 px-1 text-xs text-ink-faint" role="status" aria-live="polite">
                <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                  <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-signal/30" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-signal" />
                </span>
                <span>Routing across configured providers…</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger shadow-sm" role="alert">
                <svg className="mt-0.5 shrink-0" width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 8v4m0 4h.01M10.3 4.3L2.9 17a2 2 0 001.7 3h14.8a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Request failed</p>
                  <p className="mt-0.5 break-words text-xs text-danger/80">{error}</p>
                </div>
                <button type="button" onClick={() => setError(null)} className="shrink-0 rounded-md px-1 text-danger/70 hover:text-danger" aria-label="Dismiss error">
                  ×
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-hairline/80 bg-canvas/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:px-6 md:py-4 lg:px-8">
          <div ref={composerRef} className="mx-auto max-w-4xl">
            <Composer onSend={send} disabled={sending} projectId={activeProject?.projectId} />
            <p className="mt-2 text-center font-mono text-[10px] text-ink-faint">
              Enter to send · Shift+Enter for a new line · files and images supported
            </p>
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
