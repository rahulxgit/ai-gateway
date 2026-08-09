import axios from 'axios';
import { OpenAICompatibleAdapter } from '../providers/openai-compatible.adapter';
import { env } from '../config/env';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Regression coverage for a real, measured finding: NVIDIA NIM's free tier
// took ~61s to cold-start meta/llama-3.3-70b-instruct for a two-word
// prompt, well past the global 30s env.requestTimeoutMs default, causing
// every request to hit TIMEOUT and fail over before the model finished
// responding. Adapters can now opt into a longer per-provider timeout
// without touching the global default other providers rely on for fast
// real-outage detection.
describe('OpenAICompatibleAdapter requestTimeoutMs override', () => {
  beforeEach(() => {
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: 'test-model',
      },
    });
  });

  it('uses the per-adapter requestTimeoutMs override when provided', async () => {
    const adapter = new OpenAICompatibleAdapter({
      name: 'nvidia',
      baseUrl: 'https://example.test/v1',
      apiKey: 'fake-key',
      defaultModel: 'test-model',
      requestTimeoutMs: 90_000,
    });

    await adapter.chat({ messages: [{ role: 'user', content: 'hi' }] });

    const axiosOptions = mockedAxios.post.mock.calls[0][2] as { timeout: number };
    expect(axiosOptions.timeout).toBe(90_000);
  });

  it('falls back to env.requestTimeoutMs when no override is given', async () => {
    const adapter = new OpenAICompatibleAdapter({
      name: 'groq',
      baseUrl: 'https://example.test/v1',
      apiKey: 'fake-key',
      defaultModel: 'test-model',
    });

    await adapter.chat({ messages: [{ role: 'user', content: 'hi' }] });

    const axiosOptions = mockedAxios.post.mock.calls[0][2] as { timeout: number };
    expect(axiosOptions.timeout).toBe(env.requestTimeoutMs);
  });
});
