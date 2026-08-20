import axios from 'axios';
import { providerRegistry, listAllProviders, listFreeModels } from '../providers/registry';
import { PRICING_PER_1K_TOKENS, FREE_AUTO_PROVIDERS, DEFAULT_FAILOVER_ORDER } from '../config/routing';
import { CohereAdapter } from '../providers/cohere.adapter';
import { env } from '../config/env';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Regression coverage for Cohere, the genuinely free, recurring-quota
// provider (monthly reset, no card). It's intentionally ordered last in
// the automatic free-routing pool because its quota is too low for
// retry/failover traffic to hit on every request — see .env.example and
// cohere.adapter.ts for the reasoning.
describe('genuinely free recurring-quota provider (Cohere)', () => {
  it('is registered and exposed by listAllProviders()', () => {
    expect(providerRegistry.cohere).toBeDefined();
    expect(listAllProviders()).toEqual(expect.arrayContaining(['cohere']));
  });

  it('has a pricing entry of 0 so analytics/cost estimation never mis-bills it', () => {
    expect(PRICING_PER_1K_TOKENS.cohere).toBe(0);
  });

  it('is included in automatic routing, ordered last given its lower recurring quota', () => {
    expect(FREE_AUTO_PROVIDERS).toContain('cohere');
    expect(DEFAULT_FAILOVER_ORDER).toContain('cohere');

    // Last-resort fallback ordering: cohere sits after every higher-quota
    // free provider so it's only reached once those are exhausted.
    const higherQuotaProviders: (typeof DEFAULT_FAILOVER_ORDER)[number][] = [
      'gemini',
      'openrouter',
      'groq',
      'cerebras',
      'mistral',
      'cloudflare',
    ];
    const cohereIdx = DEFAULT_FAILOVER_ORDER.indexOf('cohere');
    for (const provider of higherQuotaProviders) {
      expect(DEFAULT_FAILOVER_ORDER.indexOf(provider)).toBeLessThan(cohereIdx);
    }
  });
});

describe('CohereAdapter', () => {
  const originalKey = env.cohereApiKey;

  beforeEach(() => {
    jest.clearAllMocks();
    env.cohereApiKey = 'test-cohere-key';
  });

  afterAll(() => {
    env.cohereApiKey = originalKey;
  });

  it('is unconfigured without a key, configured with one', () => {
    env.cohereApiKey = '';
    expect(new CohereAdapter().isConfigured()).toBe(false);
    env.cohereApiKey = 'test-cohere-key';
    expect(new CohereAdapter().isConfigured()).toBe(true);
  });

  it('sends Cohere v2/chat shape and parses the message.content block response', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'hello from Cohere' }] },
        finish_reason: 'COMPLETE',
        usage: { billed_units: { input_tokens: 5, output_tokens: 6 } },
      },
    });

    const adapter = new CohereAdapter();
    const result = await adapter.chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.content).toBe('hello from Cohere');
    expect(result.usage).toEqual({ promptTokens: 5, completionTokens: 6, totalTokens: 11 });
    expect(result.estimatedCostUsd).toBe(0);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.cohere.com/v2/chat',
      expect.objectContaining({
        model: 'command-r7b-12-2024',
        messages: [{ role: 'user', content: 'hi' }],
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-cohere-key' }),
      })
    );
  });

  it('falls back to meta.billed_units when usage.billed_units is absent (older response shape)', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
        finish_reason: 'COMPLETE',
        meta: { billed_units: { input_tokens: 2, output_tokens: 3 } },
      },
    });

    const adapter = new CohereAdapter();
    const result = await adapter.chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.usage).toEqual({ promptTokens: 2, completionTokens: 3, totalTokens: 5 });
  });

  it('drops image attachments rather than sending unsupported vision content', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        message: { role: 'assistant', content: [{ type: 'text', text: 'text-only reply' }] },
        finish_reason: 'COMPLETE',
        usage: { billed_units: { input_tokens: 1, output_tokens: 1 } },
      },
    });

    const adapter = new CohereAdapter();
    await adapter.chat({
      messages: [{ role: 'user', content: 'describe this', images: [{ mimeType: 'image/png', base64: 'x' }] }],
    });

    const sentBody = mockedAxios.post.mock.calls[0][1] as { messages: { role: string; content: string }[] };
    expect(sentBody.messages).toEqual([{ role: 'user', content: 'describe this' }]);
  });
});

describe('listFreeModels()', () => {
  it('only includes (provider, model) pairs from configured providers', () => {
    const originalCohereKey = env.cohereApiKey;
    env.cohereApiKey = 'test-cohere-key';

    try {
      const result = listFreeModels();
      expect(result).toEqual(
        expect.arrayContaining([{ provider: 'cohere', model: 'command-r7b-12-2024' }])
      );
    } finally {
      env.cohereApiKey = originalCohereKey;
    }
  });

  it('excludes providers with no freeModels declared', () => {
    const result = listFreeModels();
    expect(result.some((r) => r.provider === 'anthropic')).toBe(false);
  });

  it('reflects every entry in each configured provider\'s own freeModels property', () => {
    const originalKey = env.cohereApiKey;
    env.cohereApiKey = 'test-cohere-key';
    try {
      const result = listFreeModels();
      const cohereEntries = result.filter((r) => r.provider === 'cohere').map((r) => r.model);
      expect(cohereEntries).toEqual(providerRegistry.cohere.freeModels ?? []);
    } finally {
      env.cohereApiKey = originalKey;
    }
  });
});
