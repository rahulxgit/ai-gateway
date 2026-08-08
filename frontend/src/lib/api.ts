import type {
  AnalyticsSummary,
  ChatResult,
  ChatSession,
  ImageAttachment,
  ProjectMemory,
  ProviderHealth,
  ProviderName,
  TaskType,
  UploadResult,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// Only needed when the backend has GATEWAY_API_KEY set (see
// src/middleware/index.ts requireGatewayKey). Left unset, the header is
// simply omitted and the gateway behaves exactly as before if it's also
// running with no key configured. Vite only exposes env vars prefixed
// with VITE_ to client code, and only at build time — see README/setup
// notes for how to set this in Vercel.
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

// Render's free tier spins down after inactivity — a cold start can take
// 30-50s before the backend responds at all. Without a client-side
// timeout, a fetch during a cold start just hangs with no feedback beyond
// the generic "routing…" spinner and no way to cancel. 55s gives a cold
// start room to finish while still eventually surfacing a clear error
// instead of hanging indefinitely.
const REQUEST_TIMEOUT_MS = 55_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        // FormData sets its own multipart boundary header — forcing JSON
        // here would break file uploads silently.
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        'The gateway took too long to respond — if this is the first request in a while, the backend may just be waking up from an idle sleep. Please try again.'
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? data?.detail ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export interface SendChatInput {
  sessionId?: string;
  projectId?: string;
  messages: { role: 'user' | 'system'; content: string; images?: ImageAttachment[] }[];
  taskType?: TaskType;
  forceProvider?: ProviderName;
  model?: string;
  maxTokens?: number;
}

export const api = {
  sendChat: (input: SendChatInput) =>
    request<ChatResult>('/chat', { method: 'POST', body: JSON.stringify(input) }),

  getHealth: () =>
    request<{ status: string; providers: ProviderHealth[] }>('/health'),

  getProviders: () =>
    request<{ configured: ProviderName[]; all: ProviderName[] }>('/providers'),

  getAnalytics: () => request<{ summary: AnalyticsSummary; recent: unknown[] }>('/analytics'),

  listSessions: () => request<ChatSession[]>('/sessions'),

  createSession: (title?: string) =>
    request<ChatSession>('/sessions', { method: 'POST', body: JSON.stringify({ title }) }),

  getSessionMessages: (id: string) =>
    request<
      { role: 'system' | 'user' | 'assistant'; content: string; provider: ProviderName | null; model: string | null; createdAt: string }[]
    >(`/sessions/${id}/messages`),

  deleteSession: (id: string) => request<void>(`/session/${id}`, { method: 'DELETE' }),

  listProjects: () => request<ProjectMemory[]>('/projects'),

  createProject: (name: string, goal?: string) =>
    request<ProjectMemory>('/projects', { method: 'POST', body: JSON.stringify({ name, goal }) }),

  getProject: (id: string) => request<ProjectMemory>(`/projects/${id}`),

  uploadFile: (file: File, projectId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (projectId) formData.append('projectId', projectId);
    return request<UploadResult>('/uploads', { method: 'POST', body: formData });
  },
};
