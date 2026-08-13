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
import {
  routeChat,
  routeChatStream,
  AllProvidersFailedError,
  GatewayRequestBudgetExceededError,
} from '../services/router.service';
import { recordSuccess } from '../services/health.service';

// Mock only the env values used by router tests so changing the suite does
// not depend on a developer's local .env file.
jest.mock('../config/env', () => ({
  env: {
    ...jest.requireActual('../config/env').env,
    gatewayRequestBudgetMs: 100,
    maxRetries: 0,
  },
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
    recordSuccess('openrouter', 10);

    const result = await routeChat({
      messages: [{ role: 'user', content: 'hello' }],
      forceProvider: 'openrouter',
      model: 'deepseek/deepseek-chat-v3.1:free',
    });

    expect(openrouter.chat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'deepseek/deepseek-chat-v3.1:free' })
    );
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

  it('enforces one wall-clock budget across the entire failover chain', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    const times = [1_000, 1_050, 1_150];
    nowSpy.mockImplementation(() => times.shift() ?? 1_150);

    const gemini = mockAdapter('gemini', async () => {
      throw new ProviderError('gemini', 'TIMEOUT', 'gemini timed out');
    });
    const anthropic = mockAdapter('anthropic', async () => {
      throw new ProviderError('anthropic', 'TIMEOUT', 'anthropic timed out');
    });
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => ({ gemini, anthropic }[name as 'gemini' | 'anthropic']));
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'anthropic']);

    await expect(
      routeChat({ messages: [{ role: 'user', content: 'hello' }] })
    ).rejects.toBeInstanceOf(GatewayRequestBudgetExceededError);

    expect(gemini.chat).toHaveBeenCalledTimes(1);
    expect(anthropic.chat).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });
});

describe('routeChatStream failover / error paths', () => {
  beforeEach(() => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'anthropic']);
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
