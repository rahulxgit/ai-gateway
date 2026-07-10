import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MessageBubble } from './components/MessageBubble';
import { Composer } from './components/Composer';
import { RoutingControls } from './components/RoutingControls';
import { HealthBar } from './components/HealthBar';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { ProjectSwitcher } from './components/ProjectSwitcher';
import { api } from './lib/api';
import type { ChatMessage, ChatSession, ProjectMemory, ProviderName, TaskType } from './types';

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [taskType, setTaskType] = useState<TaskType>('general');
  const [forceProvider, setForceProvider] = useState<ProviderName | 'auto'>('auto');
  const [activeProject, setActiveProject] = useState<ProjectMemory | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
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

  const send = async (text: string) => {
    setError(null);
    const userMessage: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);

    try {
      const result = await api.sendChat({
        sessionId: activeSessionId ?? undefined,
        projectId: activeProject?.projectId,
        messages: [{ role: 'user', content: text }],
        taskType,
        forceProvider: forceProvider === 'auto' ? undefined : forceProvider,
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
    <div className="flex h-screen bg-canvas text-ink">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={selectSession}
        onNewChat={newChat}
        onDelete={deleteSession}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-hairline bg-panel px-5 py-3">
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
        </header>

        {activeProject && (
          <div className="flex items-center gap-2 border-b border-hairline bg-panel/60 px-5 py-1.5 font-mono text-[11px] text-ink-faint">
            <span className="text-ok">●</span>
            working in project <span className="text-ink-muted">{activeProject.name}</span>
            {activeProject.goal && <span>· {activeProject.goal}</span>}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-5 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.length === 0 && (
              <div className="flex h-[60vh] flex-col items-center justify-center text-center">
                <div className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-faint">
                  route · retry · failover
                </div>
                <h1 className="max-w-md text-2xl font-semibold text-ink">
                  One assistant, seven providers behind it.
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

        <div className="border-t border-hairline bg-canvas px-5 py-4">
          <div className="mx-auto max-w-3xl">
            <Composer onSend={send} disabled={sending} projectId={activeProject?.projectId} />
          </div>
        </div>
      </div>

      {showAnalytics && <AnalyticsPanel onClose={() => setShowAnalytics(false)} />}
    </div>
  );
}
