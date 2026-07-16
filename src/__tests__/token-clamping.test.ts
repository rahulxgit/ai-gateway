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

describe('per-provider maxOutputTokens configuration', () => {
  // These lock in the researched values so a future edit can't silently
  // regress them back to an unverified guess. See each adapter file for
  // the source of each number.
  it('matches verified/estimated real ceilings for every provider', () => {
    const expected: Record<string, number> = {
      gemini: 65536, // verified: Google docs
      anthropic: 64000, // verified: Anthropic docs
      openai: 128000, // verified: OpenAI docs (whole GPT-5 family)
      groq: 32768, // verified: Groq docs
      deepseek: 384000, // verified: DeepSeek docs (v4-flash)
      cerebras: 40960, // verified: Cerebras model config
      openrouter: 16384, // verified: OpenRouter model page
      together: 64000, // context-bound estimate (no separate cap published)
      mistral: 64000, // context-bound estimate (no separate cap published)
      kimi: 8192, // conservative — unverified
      huggingface: 8192, // conservative — router proxies dynamically, no fixed ceiling exists
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { providerRegistry } = require('../providers/registry');
    for (const [name, ceiling] of Object.entries(expected)) {
      expect(providerRegistry[name].maxOutputTokens).toBe(ceiling);
    }
  });
});
