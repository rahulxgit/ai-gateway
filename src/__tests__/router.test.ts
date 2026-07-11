import { ProviderError, ProviderName } from '../types';

// Mock the provider registry so we control exactly which providers are
// "configured" and how each one behaves, without any real network calls.
jest.mock('../providers/registry', () => {
  const actual = jest.requireActual('../providers/registry');
  return {
    ...actual,
    listConfiguredProviders: jest.fn(),
    getProvider: jest.fn(),
  };
});

import { listConfiguredProviders, getProvider } from '../providers/registry';
import { routeChat, AllProvidersFailedError } from '../services/router.service';
import { recordSuccess } from '../services/health.service';

function mockAdapter(name: ProviderName, impl: (options: any) => Promise<any>) {
  return {
    name,
    defaultModel: 'test-model',
    isConfigured: () => true,
    chat: jest.fn(impl),
    chatStream: jest.fn(),
  };
}

describe('routeChat failover', () => {
  beforeEach(() => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'anthropic', 'groq']);
  });

  it('uses the first healthy provider when it succeeds', async () => {
    const gemini = mockAdapter('gemini', async () => ({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      content: 'hi',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      latencyMs: 10,
      estimatedCostUsd: 0.0001,
    }));
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) =>
      name === 'gemini' ? gemini : mockAdapter(name, async () => { throw new Error('should not be called'); })
    );

    const result = await routeChat({ messages: [{ role: 'user', content: 'hello' }], taskType: 'general' });

    expect(result.response.provider).toBe('gemini');
    expect(result.failoverChain).toEqual(['gemini']);
    expect(gemini.chat).toHaveBeenCalledTimes(1);
  });

  it('fails over to the next provider on a retryable error, preserving context', async () => {
    const gemini = mockAdapter('gemini', async () => {
      throw new ProviderError('gemini', 'RATE_LIMITED', 'rate limited');
    });
    const anthropic = mockAdapter('anthropic', async () => ({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      content: 'continued response',
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      latencyMs: 20,
      estimatedCostUsd: 0.001,
    }));
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) =>
      ({ gemini, anthropic }[name as 'gemini' | 'anthropic'] ??
      mockAdapter(name, async () => { throw new Error('unexpected provider called'); }))
    );

    const result = await routeChat({
      messages: [{ role: 'user', content: 'hello' }],
      taskType: 'general',
    });

    expect(result.response.provider).toBe('anthropic');
    expect(result.response.content).toBe('continued response');
    expect(result.failoverChain).toEqual(['gemini', 'anthropic']);
  });

  it('throws AllProvidersFailedError when every configured provider fails', async () => {
    const failer = (name: ProviderName) =>
      mockAdapter(name, async () => {
        throw new ProviderError(name, 'SERVER_ERROR', `${name} down`);
      });
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => failer(name));

    await expect(
      routeChat({ messages: [{ role: 'user', content: 'hello' }] })
    ).rejects.toBeInstanceOf(AllProvidersFailedError);
  });

  it('throws a clear error when no providers are configured', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue([]);
    await expect(
      routeChat({ messages: [{ role: 'user', content: 'hello' }] })
    ).rejects.toThrow('No providers are configured');
  });

  it('only passes a model override to the provider it was intended for, not to fallback providers', async () => {
    // Regression test: a model override like an OpenRouter-specific model
    // string ("deepseek/deepseek-chat-v3.1:free") is meaningless to other
    // providers. If it leaked into the failover chain, every fallback
    // provider would receive an invalid model ID and fail immediately,
    // cascading into a total outage instead of a clean failover.
    const openrouter = mockAdapter('openrouter', async () => {
      throw new ProviderError('openrouter', 'SERVER_ERROR', 'openrouter down');
    });
    const gemini = mockAdapter('gemini', async (options) => ({
      provider: 'gemini',
      model: options.model ?? 'gemini-default-model',
      content: 'fallback response',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      latencyMs: 10,
      estimatedCostUsd: 0.0001,
    }));
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) =>
      ({ openrouter, gemini }[name as 'openrouter' | 'gemini'] ??
      mockAdapter(name, async () => { throw new Error('unexpected provider called'); }))
    );
    (listConfiguredProviders as jest.Mock).mockReturnValue(['openrouter', 'gemini']);
    // Health status is normally seeded from each adapter's real isConfigured()
    // check, which would be false here since no real OPENROUTER_API_KEY is
    // set in the test environment — that would push openrouter into the
    // "degraded" bucket and break the ordering this test depends on. Force
    // it healthy directly so the test verifies routing logic, not env setup.
    recordSuccess('openrouter', 10);

    const result = await routeChat({
      messages: [{ role: 'user', content: 'hello' }],
      forceProvider: 'openrouter',
      model: 'deepseek/deepseek-chat-v3.1:free',
    });

    // Openrouter received the override...
    expect(openrouter.chat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'deepseek/deepseek-chat-v3.1:free' })
    );
    // ...but gemini, reached only via failover, must NOT receive it.
    expect(gemini.chat).toHaveBeenCalledWith(expect.objectContaining({ model: undefined }));
    expect(result.response.model).toBe('gemini-default-model');
  });
});
