import axios from 'axios';
import { providerRegistry, listAllProviders } from '../providers/registry';
import { PRICING_PER_1K_TOKENS, FREE_AUTO_PROVIDERS, DEFAULT_FAILOVER_ORDER } from '../config/routing';
import { GitHubModelsAdapter } from '../providers/githubmodels.adapter';
import { CohereAdapter } from '../providers/cohere.adapter';
import { env } from '../config/env';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Regression coverage for the two genuinely free, recurring-quota
// providers (daily/monthly reset, no card) added alongside this test:
// GitHub Models and Cohere. Both are intentionally kept out of the
// automatic free-routing pool because their quotas are too low for
// retry/failover traffic — see .env.example and each adapter file for
// the reasoning.
describe('genuinely free recurring-quota providers (GitHub Models, Cohere)', () => {
  it('are registered and exposed by listAllProviders()', () => {
    expect(providerRegistry.githubmodels).toBeDefined();
    expect(providerRegistry.cohere).toBeDefined();
    expect(listAllProviders()).toEqual(expect.arrayContaining(['githubmodels', 'cohere']));
  });

  it('have a pricing entry of 0 so analytics/cost estimation never mis-bills them', () => {
    expect(PRICING_PER_1K_TOKENS.githubmodels).toBe(0);
    expect(PRICING_PER_1K_TOKENS.cohere).toBe(0);
  });

  it('are excluded from automatic routing given their low recurring quotas', () => {
    expect(FREE_AUTO_PROVIDERS).not.toContain('githubmodels');
    expect(FREE_AUTO_PROVIDERS).not.toContain('cohere');
    expect(DEFAULT_FAILOVER_ORDER).not.toContain('githubmodels');
    expect(DEFAULT_FAILOVER_ORDER).not.toContain('cohere');
  });
});

describe('GitHubModelsAdapter', () => {
  const originalKey = env.githubModelsApiKey;

  beforeEach(() => {
    jest.clearAllMocks();
    env.githubModelsApiKey = 'test-github-token';
  });

  afterAll(() => {
    env.githubModelsApiKey = originalKey;
  });

  it('is unconfigured without a token, configured with one', () => {
    env.githubModelsApiKey = '';
    expect(new GitHubModelsAdapter().isConfigured()).toBe(false);
    env.githubModelsApiKey = 'test-github-token';
    expect(new GitHubModelsAdapter().isConfigured()).toBe(true);
  });

  it('sends the OpenAI-compatible chat contract to models.github.ai/inference', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        model: 'openai/gpt-4o-mini',
        choices: [{ message: { content: 'hello from GitHub Models' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      },
    });

    const adapter = new GitHubModelsAdapter();
    const result = await adapter.chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.content).toBe('hello from GitHub Models');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://models.github.ai/inference/chat/completions',
      expect.objectContaining({ model: 'openai/gpt-4o-mini' }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-github-token' }),
      })
    );
  });

  it('reports the default model as free for cost estimation', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        model: 'openai/gpt-4o-mini',
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    });

    const adapter = new GitHubModelsAdapter();
    const result = await adapter.chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.estimatedCostUsd).toBe(0);
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
