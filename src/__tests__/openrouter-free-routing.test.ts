import { OpenRouterAdapter, OPENROUTER_FREE_MODEL } from '../providers/openrouter.adapter';
import { OpenAICompatibleAdapter } from '../providers/openai-compatible.adapter';
import { PRICING_PER_1K_TOKENS, buildProviderOrder, FREE_AUTO_PROVIDERS } from '../config/routing';

jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  isAxiosError: jest.fn(() => false),
}));

describe('OpenRouter free routing', () => {
  it('uses openrouter/free as the default model', () => {
    const adapter = new OpenRouterAdapter();
    expect(adapter.defaultModel).toBe(OPENROUTER_FREE_MODEL);
  });

  it('treats the OpenRouter free router as available without literal /models membership', async () => {
    const adapter = new OpenRouterAdapter();
    await expect(adapter.checkModelAvailability()).resolves.toEqual({
      status: 'available',
      model: OPENROUTER_FREE_MODEL,
      detail: 'dynamic OpenRouter free router; availability is validated on inference',
    });
  });

  it('reports zero cost for explicit :free model variants too', async () => {
    const adapter = new OpenAICompatibleAdapter({
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      defaultModel: OPENROUTER_FREE_MODEL,
      freeModels: [OPENROUTER_FREE_MODEL],
    });

    const axios = require('axios') as { post: jest.Mock };
    axios.post.mockResolvedValueOnce({
      data: {
        model: 'openai/gpt-oss-120b:free',
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
    });

    const response = await adapter.chat({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'openai/gpt-oss-120b:free',
    });
    expect(response.estimatedCostUsd).toBe(0);
  });
});

describe('free-first routing policy', () => {
  it('restricts automatic provider order to configured free-tier providers', () => {
    expect(FREE_AUTO_PROVIDERS).toEqual([
      'gemini',
      'groq',
      'openrouter',
      'cerebras',
      'mistral',
      'cloudflare',
    ]);

    const order = buildProviderOrder('general', undefined);
    expect(order.every((provider) => FREE_AUTO_PROVIDERS.includes(provider))).toBe(true);
    expect(order).toContain('openrouter');
  });

  it('marks automatically routed free providers as zero-cost for analytics', () => {
    for (const provider of FREE_AUTO_PROVIDERS) {
      expect(PRICING_PER_1K_TOKENS[provider]).toBe(0);
    }
  });
});
