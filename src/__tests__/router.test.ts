import { ProviderAdapterOptions, ProviderError, ProviderName, ProviderResponse } from '../types';

jest.mock('../providers/registry', () => {
  const actual = jest.requireActual('../providers/registry');
  return { ...actual, listConfiguredProviders: jest.fn(), getProvider: jest.fn() };
});

import { listConfiguredProviders, getProvider } from '../providers/registry';
import { routeChat, routeChatStream, AllProvidersFailedError, GatewayRequestBudgetExceededError } from '../services/router.service';
import { recordSuccess, recordFailure } from '../services/health.service';

jest.mock('../config/env', () => ({
  env: { ...jest.requireActual('../config/env').env, gatewayRequestBudgetMs: 100, maxRetries: 2 },
}));

function mockAdapter(
  name: ProviderName,
  impl: (options: ProviderAdapterOptions) => Promise<ProviderResponse>,
  options: { supportsVision?: boolean } = {}
) {
  return {
    name,
    defaultModel: 'test-model',
    supportsVision: options.supportsVision ?? true,
    isConfigured: () => true,
    chat: jest.fn(impl),
    chatStream: jest.fn(),
  };
}

describe('routeChat free-first failover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const provider of ['gemini', 'openrouter', 'groq', 'cerebras', 'mistral', 'cloudflare'] as ProviderName[]) {
      recordSuccess(provider, 1);
    }
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'openrouter', 'groq']);
  });

  it('uses the first healthy free provider when it succeeds', async () => {
    const gemini = mockAdapter('gemini', async () => ({
      provider: 'gemini', model: 'gemini-3.1-flash-lite', content: 'hi',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 10, estimatedCostUsd: 0,
    }));
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) =>
      name === 'gemini' ? gemini : mockAdapter(name, async () => { throw new Error('should not be called'); })
    );

    const result = await routeChat({ messages: [{ role: 'user', content: 'hello' }] });
    expect(result.response.provider).toBe('gemini');
    expect(result.failoverChain).toEqual(['gemini']);
    expect(gemini.chat).toHaveBeenCalledTimes(1);
  });

  it('moves immediately to the next free provider on 429 without retrying the same provider', async () => {
    const gemini = mockAdapter('gemini', async () => {
      throw new ProviderError('gemini', 'RATE_LIMITED', 'rate limited', 429);
    });
    const openrouter = mockAdapter('openrouter', async () => ({
      provider: 'openrouter', model: 'openai/gpt-oss-120b:free', content: 'continued response',
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 }, latencyMs: 20, estimatedCostUsd: 0,
    }));
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => ({ gemini, openrouter }[name as 'gemini' | 'openrouter']));

    const result = await routeChat({ messages: [{ role: 'user', content: 'hello' }] });
    expect(result.response.provider).toBe('openrouter');
    expect(result.failoverChain).toEqual(['gemini', 'openrouter']);
    expect(gemini.chat).toHaveBeenCalledTimes(1);
    expect(openrouter.chat).toHaveBeenCalledTimes(1);
  });

  it('never automatically calls a paid provider after all free providers fail', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'openrouter', 'groq', 'cerebras', 'mistral', 'cloudflare', 'openai']);
    const adapters: Record<string, ReturnType<typeof mockAdapter>> = {};
    for (const provider of ['gemini', 'openrouter', 'groq', 'cerebras', 'mistral', 'cloudflare', 'openai'] as ProviderName[]) {
      adapters[provider] = mockAdapter(provider, async () => { throw new ProviderError(provider, 'SERVER_ERROR', `${provider} down`); });
    }
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => adapters[name]);

    await expect(routeChat({ messages: [{ role: 'user', content: 'hello' }] })).rejects.toBeInstanceOf(AllProvidersFailedError);
    expect(adapters.openai.chat).not.toHaveBeenCalled();
  });

  it('allows an explicitly forced paid provider and never falls through', async () => {
    const openai = mockAdapter('openai', async () => ({
      provider: 'openai', model: 'gpt-5', content: 'paid manual route',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 5, estimatedCostUsd: 0.001,
    }));
    const gemini = mockAdapter('gemini', async () => { throw new Error('automatic fallback must not run'); });
    (listConfiguredProviders as jest.Mock).mockReturnValue(['openai', 'gemini']);
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => ({ openai, gemini }[name as 'openai' | 'gemini']));

    const result = await routeChat({ messages: [{ role: 'user', content: 'hello' }], forceProvider: 'openai', model: 'gpt-5' });
    expect(result.response.provider).toBe('openai');
    expect(openai.chat).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5' }));
    expect(gemini.chat).not.toHaveBeenCalled();
    expect(result.failoverChain).toEqual(['openai']);
  });

  it('treats forceProvider as exactly one provider and preserves its model override', async () => {
    const openrouter = mockAdapter('openrouter', async (options) => ({
      provider: 'openrouter', model: options.model ?? 'openrouter/free', content: 'forced',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 5, estimatedCostUsd: 0,
    }));
    const gemini = mockAdapter('gemini', async () => { throw new Error('fallback must never be called'); });
    (listConfiguredProviders as jest.Mock).mockReturnValue(['openrouter', 'gemini']);
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => ({ openrouter, gemini }[name as 'openrouter' | 'gemini']));

    const result = await routeChat({ messages: [{ role: 'user', content: 'hello' }], forceProvider: 'openrouter', model: 'deepseek/deepseek-chat-v3.1:free' });
    expect(openrouter.chat).toHaveBeenCalledWith(expect.objectContaining({ model: 'deepseek/deepseek-chat-v3.1:free' }));
    expect(gemini.chat).not.toHaveBeenCalled();
    expect(result.failoverChain).toEqual(['openrouter']);
  });

  it('skips a provider during its quota cooldown', async () => {
    recordFailure('openrouter', 'QUOTA_EXCEEDED', 'daily quota exhausted');
    const gemini = mockAdapter('gemini', async () => ({
      provider: 'gemini', model: 'gemini-3.1-flash-lite', content: 'from gemini',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 10, estimatedCostUsd: 0,
    }));
    const openrouter = mockAdapter('openrouter', async () => { throw new Error('cooling-down provider must not be called'); });
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => ({ gemini, openrouter }[name as 'gemini' | 'openrouter']));

    const result = await routeChat({ messages: [{ role: 'user', content: 'hello' }] });
    expect(result.response.provider).toBe('gemini');
    expect(openrouter.chat).not.toHaveBeenCalled();
  });

  it('throws a clear error when no automatic providers are configured', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue([]);
    await expect(routeChat({ messages: [{ role: 'user', content: 'hello' }] })).rejects.toThrow('No free automatic providers are currently available');
  });

  it('only routes image-bearing requests to providers that support vision', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'groq']);
    const gemini = mockAdapter('gemini', async () => ({
      provider: 'gemini', model: 'gemini-3.1-flash-lite', content: 'image response',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 5, estimatedCostUsd: 0,
    }));
    const groq = mockAdapter('groq', async () => ({
      provider: 'groq', model: 'qwen/qwen3.6-27b', content: 'should not run',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 5, estimatedCostUsd: 0,
    }), { supportsVision: false });
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => ({ gemini, groq }[name as 'gemini' | 'groq']));

    const result = await routeChat({ messages: [{ role: 'user', content: 'describe', images: [{ mimeType: 'image/png', base64: 'x' }] }] });
    expect(result.response.provider).toBe('gemini');
    expect(groq.chat).not.toHaveBeenCalled();
  });

  it('enforces one wall-clock budget across the failover chain', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    const times = [1_000, 1_050, 1_150];
    nowSpy.mockImplementation(() => times.shift() ?? 1_150);
    const gemini = mockAdapter('gemini', async () => { throw new ProviderError('gemini', 'TIMEOUT', 'timed out'); });
    const openrouter = mockAdapter('openrouter', async () => { throw new ProviderError('openrouter', 'TIMEOUT', 'timed out'); });
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'openrouter']);
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => ({ gemini, openrouter }[name as 'gemini' | 'openrouter']));

    await expect(routeChat({ messages: [{ role: 'user', content: 'hello' }] })).rejects.toBeInstanceOf(GatewayRequestBudgetExceededError);
    expect(gemini.chat).toHaveBeenCalledTimes(1);
    expect(openrouter.chat).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });
});

describe('routeChatStream failover / error paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recordSuccess('gemini', 10);
    recordSuccess('openrouter', 10);
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'openrouter']);
  });

  it('fails over before the first token when a provider errors', async () => {
    const gemini = {
      name: 'gemini' as ProviderName, defaultModel: 'test-model', supportsVision: true, isConfigured: () => true,
      chat: jest.fn(), chatStream: jest.fn(async () => { throw new ProviderError('gemini', 'RATE_LIMITED', 'rate limited'); }),
    };
    const openrouter = {
      name: 'openrouter' as ProviderName, defaultModel: 'openrouter/free', supportsVision: true, isConfigured: () => true,
      chat: jest.fn(),
      chatStream: jest.fn(async (_options: ProviderAdapterOptions, onChunk: (c: unknown) => void) => {
        onChunk({ provider: 'openrouter', model: 'openrouter/free', delta: 'hi', done: false });
        return { provider: 'openrouter', model: 'openrouter/free', content: 'hi', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 5, estimatedCostUsd: 0 } as ProviderResponse;
      }),
    };
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => ({ gemini, openrouter }[name as 'gemini' | 'openrouter']));

    const chunks: unknown[] = [];
    const result = await routeChatStream({ messages: [{ role: 'user', content: 'hello' }] }, (chunk) => chunks.push(chunk));
    expect(result.response.provider).toBe('openrouter');
    expect(result.failoverChain).toEqual(['gemini', 'openrouter']);
    expect(gemini.chatStream).toHaveBeenCalledTimes(1);
    expect(chunks).toHaveLength(1);
  });

  it('does not silently switch providers after a streaming token has been emitted', async () => {
    const gemini = {
      name: 'gemini' as ProviderName, defaultModel: 'test-model', supportsVision: true, isConfigured: () => true,
      chat: jest.fn(),
      chatStream: jest.fn(async (_options: ProviderAdapterOptions, onChunk: (c: unknown) => void) => {
        onChunk({ provider: 'gemini', model: 'test-model', delta: 'partial', done: false });
        throw new ProviderError('gemini', 'SERVER_ERROR', 'died mid-stream');
      }),
    };
    const openrouter = {
      name: 'openrouter' as ProviderName, defaultModel: 'test-model', supportsVision: true, isConfigured: () => true,
      chat: jest.fn(), chatStream: jest.fn(),
    };
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => ({ gemini, openrouter }[name as 'gemini' | 'openrouter']));

    await expect(routeChatStream({ messages: [{ role: 'user', content: 'hello' }] }, () => {})).rejects.toBeInstanceOf(AllProvidersFailedError);
    expect(openrouter.chatStream).not.toHaveBeenCalled();
  });
});
