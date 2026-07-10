import type {
  AnalyticsSummary,
  ChatResult,
  ChatSession,
  ProviderHealth,
  ProviderName,
  TaskType,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? data?.detail ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export interface SendChatInput {
  sessionId?: string;
  projectId?: string;
  messages: { role: 'user' | 'system'; content: string }[];
  taskType?: TaskType;
  forceProvider?: ProviderName;
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
};
