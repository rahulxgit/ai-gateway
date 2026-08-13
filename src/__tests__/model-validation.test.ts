import axios from 'axios';
import { AnthropicAdapter } from '../providers/anthropic.adapter';
import { GeminiAdapter } from '../providers/gemini.adapter';
import { OpenAICompatibleAdapter } from '../providers/openai-compatible.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeOpenAICompatibleAdapter(defaultModel: string) {
  return new OpenAICompatibleAdapter({
    name: 'groq',
    baseUrl: 'https://example.test/v1',
    apiKey: 'fake-key',
    defaultModel,
  });
}

describe('OpenAICompatibleAdapter.checkModelAvailability', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports "available" when the defaultModel is present in GET /models', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { data: [{ id: 'qwen/qwen3.6-27b' }, { id: 'openai/gpt-oss-120b' }] },
    });
    const adapter = makeOpenAICompatibleAdapter('qwen/qwen3.6-27b');

    const result = await adapter.checkModelAvailability!();

    expect(result.status).toBe('available');
    expect(result.model).toBe('qwen/qwen3.6-27b');
  });

  it('reports "unavailable" when the defaultModel is missing from the live catalog (deprecation)', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { data: [{ id: 'openai/gpt-oss-120b' }, { id: 'qwen/qwen3.6-27b' }] },
    });
    const adapter = makeOpenAICompatibleAdapter('meta-llama/llama-4-scout-17b-16e-instruct');

    const result = await adapter.checkModelAvailability!();

    expect(result.status).toBe('unavailable');
    expect(result.detail).toContain('not present');
  });

  it('reports "undetermined" (never "unavailable") when the check itself fails, so a network blip is not mistaken for a real deprecation', async () => {
    mockedAxios.get.mockRejectedValue(new Error('timeout'));
    const adapter = makeOpenAICompatibleAdapter('some-model');

    const result = await adapter.checkModelAvailability!();

    expect(result.status).toBe('undetermined');
  });

  it('reports "undetermined" for an unconfigured adapter without making a network call', async () => {
    const adapter = new OpenAICompatibleAdapter({
      name: 'groq',
      baseUrl: 'https://example.test/v1',
      apiKey: '',
      defaultModel: 'some-model',
    });

    const result = await adapter.checkModelAvailability!();

    expect(result.status).toBe('undetermined');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});

describe('GeminiAdapter.checkModelAvailability', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports "available" when the defaultModel is present in Gemini model names', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        models: [
          { name: 'models/gemini-3.1-flash-lite' },
          { name: 'models/gemini-2.5-flash-lite' },
        ],
      },
    });
    const adapter = new GeminiAdapter();

    const result = await adapter.checkModelAvailability();

    expect(result.status).toBe('available');
    expect(result.model).toBe(adapter.defaultModel);
  });

  it('reports "unavailable" when Gemini has removed the default model', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { models: [{ name: 'models/gemini-2.5-flash-lite' }] },
    });
    const adapter = new GeminiAdapter();

    const result = await adapter.checkModelAvailability();

    expect(result.status).toBe('unavailable');
    expect(result.detail).toContain('not present');
  });

  it('reports "undetermined" when Gemini model discovery fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('timeout'));
    const adapter = new GeminiAdapter();

    const result = await adapter.checkModelAvailability();

    expect(result.status).toBe('undetermined');
  });
});

describe('AnthropicAdapter.checkModelAvailability', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports "available" when the defaultModel is present in Anthropic models', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        data: [
          { id: 'claude-haiku-4-5-20251001' },
          { id: 'claude-sonnet-4-5' },
        ],
      },
    });
    const adapter = new AnthropicAdapter();

    const result = await adapter.checkModelAvailability();

    expect(result.status).toBe('available');
    expect(result.model).toBe(adapter.defaultModel);
  });

  it('reports "unavailable" when Anthropic has removed the default model', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { data: [{ id: 'claude-sonnet-4-5' }] },
    });
    const adapter = new AnthropicAdapter();

    const result = await adapter.checkModelAvailability();

    expect(result.status).toBe('unavailable');
    expect(result.detail).toContain('not present');
  });

  it('reports "undetermined" when Anthropic model discovery fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('timeout'));
    const adapter = new AnthropicAdapter();

    const result = await adapter.checkModelAvailability();

    expect(result.status).toBe('undetermined');
  });
});
