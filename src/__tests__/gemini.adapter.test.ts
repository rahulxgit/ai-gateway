import { EventEmitter } from 'events';
import axios from 'axios';
import { env } from '../config/env';
import { GeminiAdapter } from '../providers/gemini.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GeminiAdapter', () => {
  const originalApiKey = env.geminiApiKey;

  beforeEach(() => {
    jest.clearAllMocks();
    env.geminiApiKey = 'test-gemini-key';
  });

  afterAll(() => {
    env.geminiApiKey = originalApiKey;
  });

  it('uses the current GA free-tier default model and Gemini OpenAI-compatible endpoint', () => {
    const adapter = new GeminiAdapter();
    expect(adapter.defaultModel).toBe('gemini-3.1-flash-lite');
    expect(adapter.maxOutputTokens).toBe(65536);
    expect(adapter.supportsVision).toBe(true);
  });

  it('reports the default Gemini model as genuinely free for analytics', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        model: 'gemini-3.1-flash-lite',
        choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      },
    });

    const adapter = new GeminiAdapter();
    const result = await adapter.chat({
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.estimatedCostUsd).toBe(0);
  });

  it('sends the OpenAI-compatible non-streaming Gemini HTTP contract', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        model: 'gemini-3.1-flash-lite',
        choices: [{ message: { content: 'hello back' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
      },
    });

    const adapter = new GeminiAdapter();
    const result = await adapter.chat({
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Hello Gemini' },
      ],
      temperature: 0.2,
      maxTokens: 2048,
    });

    expect(result.content).toBe('hello back');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        model: 'gemini-3.1-flash-lite',
        messages: [
          { role: 'system', content: 'Be concise.' },
          { role: 'user', content: 'Hello Gemini' },
        ],
        max_tokens: 2048,
      },
      expect.objectContaining({
        timeout: env.requestTimeoutMs,
        headers: expect.objectContaining({
          Authorization: 'Bearer test-gemini-key',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('sends the OpenAI-compatible streaming Gemini HTTP contract and parses SSE chunks', async () => {
    const stream = new EventEmitter();
    mockedAxios.post.mockResolvedValue({ data: stream });

    const adapter = new GeminiAdapter();
    const chunks: string[] = [];
    const requestPromise = adapter.chatStream(
      {
        messages: [{ role: 'user', content: 'stream this' }],
      },
      (chunk) => {
        if (chunk.delta) chunks.push(chunk.delta);
      }
    );

    // Let the mocked axios promise resolve and attach the stream listeners
    // before emitting SSE frames; otherwise the synchronous emits can race
    // the adapter's first await and disappear from the test stream.
    await Promise.resolve();

    stream.emit(
      'data',
      'data: {"choices":[{"delta":{"content":"hello "}}]}\n\n'
    );
    stream.emit(
      'data',
      'data: {"choices":[{"delta":{"content":"world"}}],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}\n\n'
    );
    stream.emit('data', 'data: [DONE]\n\n');
    stream.emit('end');

    const result = await requestPromise;

    expect(chunks).toEqual(['hello ', 'world']);
    expect(result.content).toBe('hello world');
    expect(result.usage.totalTokens).toBe(4);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      expect.objectContaining({
        model: 'gemini-3.1-flash-lite',
        max_tokens: 1024,
        stream: true,
      }),
      expect.objectContaining({ responseType: 'stream' })
    );
  });

  it('uses the configured env object for API-key initialization', () => {
    const original = env.geminiApiKey;
    try {
      env.geminiApiKey = '';
      expect(new GeminiAdapter().isConfigured()).toBe(false);
      env.geminiApiKey = 'configured-key';
      expect(new GeminiAdapter().isConfigured()).toBe(true);
    } finally {
      env.geminiApiKey = original;
    }
  });
});
