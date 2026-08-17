jest.mock('../config/env', () => ({
  env: {
    ...jest.requireActual('../config/env').env,
    openrouterApiKey: 'test-openrouter-key',
  },
}));

import axios from 'axios';
import { OpenRouterAdapter, OPENROUTER_FREE_MODEL } from '../providers/openrouter.adapter';
import { OpenAICompatibleAdapter } from '../providers/openai-compatible.adapter';
import { FREE_AUTO_PROVIDERS, FREE_MODEL_IDS, buildProviderOrder, isFreeModel } from '../config/routing';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenRouter free routing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses openrouter/free as the default model', () => {
    expect(new OpenRouterAdapter().defaultModel).toBe(OPENROUTER_FREE_MODEL);
  });

  it('treats the OpenRouter free router as available without literal /models membership', async () => {
    await expect(new OpenRouterAdapter().checkModelAvailability()).resolves.toEqual({
      status: 'available',
      model: OPENROUTER_FREE_MODEL,
      detail: 'dynamic OpenRouter free router; availability is validated on inference',
    });
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('reports zero cost when the dynamic router returns a concrete free model', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        model: 'openai/gpt-oss-120b:free',
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
    } as never);

    const response = await new OpenRouterAdapter().chat({ messages: [{ role: 'user', content: 'hi' }] });
    expect(response.model).toBe('openai/gpt-oss-120b:free');
    expect(response.estimatedCostUsd).toBe(0);
  });

  it('reports a forced paid model using the provider pricing estimate instead of $0', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        model: 'some-paid-model',
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1000, completion_tokens: 1000, total_tokens: 2000 },
      },
    } as never);

    const response = await new OpenAICompatibleAdapter({
      name: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'test-key',
      defaultModel: OPENROUTER_FREE_MODEL, freeModels: [OPENROUTER_FREE_MODEL],
    }).chat({ messages: [{ role: 'user', content: 'hi' }], model: 'some-paid-model' });

    expect(response.estimatedCostUsd).toBeGreaterThan(0);
  });
});

describe('free-first routing policy', () => {
  it('restricts automatic provider order to the configured free-tier pool', () => {
    expect(FREE_AUTO_PROVIDERS).toEqual(['gemini', 'openrouter', 'groq', 'cerebras', 'mistral', 'cloudflare', 'githubmodels', 'cohere']);
    const order = buildProviderOrder('general', undefined);
    expect(order.every((provider) => FREE_AUTO_PROVIDERS.includes(provider))).toBe(true);
  });

  it('treats only declared free models and :free variants as zero-cost', () => {
    for (const provider of FREE_AUTO_PROVIDERS) {
      for (const model of FREE_MODEL_IDS[provider] ?? []) expect(isFreeModel(provider, model)).toBe(true);
    }
    expect(isFreeModel('openrouter', 'openai/gpt-oss-120b:free')).toBe(true);
    expect(isFreeModel('openrouter', 'openai/gpt-5')).toBe(false);
    expect(isFreeModel('groq', 'some-paid-model')).toBe(false);
  });

  it('does not treat an arbitrary forced model as free because its provider has a free default', () => {
    expect(isFreeModel('gemini', 'gemini-paid-example')).toBe(false);
    expect(isFreeModel('cerebras', 'paid-example')).toBe(false);
  });

  it('treats forceProvider as a single-provider route', () => {
    expect(buildProviderOrder('general', 'openrouter')).toEqual(['openrouter']);
  });
});
