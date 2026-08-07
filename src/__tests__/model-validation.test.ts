import axios from 'axios';
import { OpenAICompatibleAdapter } from '../providers/openai-compatible.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeAdapter(defaultModel: string) {
  return new OpenAICompatibleAdapter({
    name: 'groq',
    baseUrl: 'https://example.test/v1',
    apiKey: 'fake-key',
    defaultModel,
  });
}

// Regression coverage for the exact failure mode that hit production:
// Groq silently deprecated meta-llama/llama-4-scout-17b-16e-instruct and
// the gateway had no way to notice until a live chat request 404'd.
describe('OpenAICompatibleAdapter.checkModelAvailability', () => {
  it('reports "available" when the defaultModel is present in GET /models', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { data: [{ id: 'qwen/qwen3.6-27b' }, { id: 'openai/gpt-oss-120b' }] },
    });
    const adapter = makeAdapter('qwen/qwen3.6-27b');

    const result = await adapter.checkModelAvailability!();

    expect(result.status).toBe('available');
    expect(result.model).toBe('qwen/qwen3.6-27b');
  });

  it('reports "unavailable" when the defaultModel is missing from the live catalog (deprecation)', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { data: [{ id: 'openai/gpt-oss-120b' }, { id: 'qwen/qwen3.6-27b' }] },
    });
    const adapter = makeAdapter('meta-llama/llama-4-scout-17b-16e-instruct');

    const result = await adapter.checkModelAvailability!();

    expect(result.status).toBe('unavailable');
    expect(result.detail).toContain('not present');
  });

  it('reports "undetermined" (never "unavailable") when the check itself fails, so a network blip is not mistaken for a real deprecation', async () => {
    mockedAxios.get.mockRejectedValue(new Error('timeout'));
    const adapter = makeAdapter('some-model');

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
