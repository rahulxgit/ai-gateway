import { ProviderAdapterOptions, ProviderError, ProviderName, ProviderResponse } from '../types';

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
import { routeChat, routeChatStream, AllProvidersFailedError } from '../services/router.service';
import { recordSuccess } from '../services/health.service';

// supportsVision defaults to true so most tests (which don't care about
// vision routing) don't need it; the few vision-specific tests below
// override it via the options param, avoiding the `as any` casts that
// were previously needed to bolt the property on after construction.
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

  it('only routes image-bearing requests to providers that support vision', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'groq', 'anthropic']);

    const gemini = mockAdapter('gemini', async () => ({
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      content: 'I see a cat in the image',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      latencyMs: 20,
      estimatedCostUsd: 0.0001,
    }));
    const groq = mockAdapter(
      'groq',
      async () => {
        throw new Error('groq should never be called for a vision request');
      },
      { supportsVision: false }
    );
    const anthropic = mockAdapter('anthropic', async () => {
      throw new Error('anthropic should not be reached since gemini succeeds first');
    });

    (getProvider as jest.Mock).mockImplementation(
      (name: ProviderName) => ({ gemini, groq, anthropic }[name as 'gemini' | 'groq' | 'anthropic'])
    );

    const result = await routeChat({
      messages: [
        {
          role: 'user',
          content: 'What is in this image?',
          images: [{ mimeType: 'image/png', base64: 'ZmFrZWRhdGE=' }],
        },
      ],
    });

    expect(result.response.provider).toBe('gemini');
    expect(groq.chat).not.toHaveBeenCalled();
  });

  it('throws a vision-specific error when no configured provider supports images', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['groq']);
    const groq = mockAdapter(
      'groq',
      async () => {
        throw new Error('should never be called');
      },
      { supportsVision: false }
    );
    (getProvider as jest.Mock).mockImplementation(() => groq);

    await expect(
      routeChat({
        messages: [
          { role: 'user', content: 'describe this', images: [{ mimeType: 'image/png', base64: 'x' }] },
        ],
      })
    ).rejects.toThrow('No vision-capable providers are configured');
  });
});

describe('routeChatStream failover / error paths', () => {
  beforeEach(() => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'anthropic']);
    // health.service is a shared module-level singleton across the whole
    // test file — a prior test's recordFailure() would otherwise leak in
    // here and reorder candidates ahead of listConfiguredProviders'
    // configured order via the healthy/degraded split in candidateOrder().
    // Force both back to a known-healthy, equal-footing state so these
    // tests are deterministic regardless of test execution order.
    recordSuccess('gemini', 10);
    recordSuccess('anthropic', 10);
  });

  it('fails over to the next provider if a provider errors before emitting any chunk', async () => {
    const gemini = {
      name: 'gemini' as ProviderName,
      defaultModel: 'test-model',
      supportsVision: true,
      isConfigured: () => true,
      chat: jest.fn(),
      chatStream: jest.fn(async () => {
        throw new ProviderError('gemini', 'RATE_LIMITED', 'rate limited');
      }),
    };
    const anthropic = {
      name: 'anthropic' as ProviderName,
      defaultModel: 'test-model',
      supportsVision: true,
      isConfigured: () => true,
      chat: jest.fn(),
      chatStream: jest.fn(async (_options: ProviderAdapterOptions, onChunk: (c: unknown) => void) => {
        onChunk({ provider: 'anthropic', model: 'test-model', delta: 'hi', done: false });
        return {
          provider: 'anthropic',
          model: 'test-model',
          content: 'hi',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          latencyMs: 5,
          estimatedCostUsd: 0.0001,
        } as ProviderResponse;
      }),
    };
    (getProvider as jest.Mock).mockImplementation(
      (name: ProviderName) => ({ gemini, anthropic }[name as 'gemini' | 'anthropic'])
    );

    const chunks: unknown[] = [];
    const result = await routeChatStream(
      { messages: [{ role: 'user', content: 'hello' }] },
      (chunk) => chunks.push(chunk)
    );

    expect(result.response.provider).toBe('anthropic');
    expect(result.failoverChain).toEqual(['gemini', 'anthropic']);
    expect(chunks).toHaveLength(1);
  });

  it('surfaces AllProvidersFailedError instead of silently switching once a chunk has already reached the client', async () => {
    const gemini = {
      name: 'gemini' as ProviderName,
      defaultModel: 'test-model',
      supportsVision: true,
      isConfigured: () => true,
      chat: jest.fn(),
      chatStream: jest.fn(async (_options: ProviderAdapterOptions, onChunk: (c: unknown) => void) => {
        onChunk({ provider: 'gemini', model: 'test-model', delta: 'partial', done: false });
        throw new ProviderError('gemini', 'SERVER_ERROR', 'died mid-stream');
      }),
    };
    const anthropic = {
      name: 'anthropic' as ProviderName,
      defaultModel: 'test-model',
      supportsVision: true,
      isConfigured: () => true,
      chat: jest.fn(),
      chatStream: jest.fn(async () => {
        throw new Error('anthropic should never be reached — mid-stream failures must not fail over');
      }),
    };
    (getProvider as jest.Mock).mockImplementation(
      (name: ProviderName) => ({ gemini, anthropic }[name as 'gemini' | 'anthropic'])
    );

    await expect(
      routeChatStream({ messages: [{ role: 'user', content: 'hello' }] }, () => {})
    ).rejects.toBeInstanceOf(AllProvidersFailedError);
    expect(anthropic.chatStream).not.toHaveBeenCalled();
  });
});
