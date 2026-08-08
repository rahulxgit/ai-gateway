import axios from 'axios';
import { OpenAICompatibleAdapter } from '../providers/openai-compatible.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Regression coverage for qwen3.6-27b on Groq leaking its internal
// chain-of-thought into the visible content field wrapped in
// <think>...</think> tags, which showed up raw in a real chat response.
describe('OpenAICompatibleAdapter reasoning-model output', () => {
  it('strips <think>...</think> tags from the returned content', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: { content: '<think>\nStep 1: greet\nStep 2: offer help\n</think>\nHello! How can I help you today?' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'test-model',
      },
    });
    const adapter = new OpenAICompatibleAdapter({
      name: 'groq',
      baseUrl: 'https://example.test/v1',
      apiKey: 'fake-key',
      defaultModel: 'test-model',
    });

    const result = await adapter.chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.content).toBe('Hello! How can I help you today?');
    expect(result.content).not.toContain('<think>');
  });

  it('leaves normal content untouched when there are no think tags', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Just a normal reply.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        model: 'test-model',
      },
    });
    const adapter = new OpenAICompatibleAdapter({
      name: 'openai',
      baseUrl: 'https://example.test/v1',
      apiKey: 'fake-key',
      defaultModel: 'test-model',
    });

    const result = await adapter.chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.content).toBe('Just a normal reply.');
  });

  it('merges extraBodyParams (e.g. reasoning_format) into the outgoing request', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: 'test-model',
      },
    });
    const adapter = new OpenAICompatibleAdapter({
      name: 'groq',
      baseUrl: 'https://example.test/v1',
      apiKey: 'fake-key',
      defaultModel: 'test-model',
      extraBodyParams: { reasoning_format: 'hidden' },
    });

    await adapter.chat({ messages: [{ role: 'user', content: 'hi' }] });

    const sentBody = mockedAxios.post.mock.calls[0][1] as { reasoning_format?: string };
    expect(sentBody.reasoning_format).toBe('hidden');
  });
});
