import axios from 'axios';
import { OpenAICompatibleAdapter } from '../providers/openai-compatible.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeAdapter(maxOutputTokens: number) {
  return new OpenAICompatibleAdapter({
    name: 'groq',
    baseUrl: 'https://example.test/v1',
    apiKey: 'fake-key',
    defaultModel: 'test-model',
    maxOutputTokens,
  });
}

describe('OpenAICompatibleAdapter max token clamping', () => {
  beforeEach(() => {
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: 'test-model',
      },
    });
  });

  it('clamps a requested maxTokens above the provider ceiling down to that ceiling', async () => {
    const adapter = makeAdapter(32768); // e.g. Groq's real ceiling

    await adapter.chat({
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 64000, // over the ceiling — must not be sent as-is
    });

    const sentBody = mockedAxios.post.mock.calls[0][1] as { max_tokens: number };
    expect(sentBody.max_tokens).toBe(32768);
  });

  it('passes through a requested maxTokens that is within the provider ceiling', async () => {
    const adapter = makeAdapter(32768);

    await adapter.chat({
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 2000,
    });

    const sentBody = mockedAxios.post.mock.calls[0][1] as { max_tokens: number };
    expect(sentBody.max_tokens).toBe(2000);
  });

  it('falls back to the provider ceiling itself when no maxTokens is requested', async () => {
    const adapter = makeAdapter(8000); // e.g. DeepSeek's real ceiling

    await adapter.chat({ messages: [{ role: 'user', content: 'hi' }] });

    const sentBody = mockedAxios.post.mock.calls[0][1] as { max_tokens: number };
    expect(sentBody.max_tokens).toBe(8000);
  });
});
