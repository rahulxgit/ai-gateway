import { GeminiAdapter } from '../providers/gemini.adapter';

describe('GeminiAdapter', () => {
  it('uses the current GA free-tier default model and Gemini OpenAI-compatible endpoint', () => {
    const adapter = new GeminiAdapter();
    expect(adapter.defaultModel).toBe('gemini-3.1-flash-lite');
    expect(adapter.maxOutputTokens).toBe(65536);
    expect(adapter.supportsVision).toBe(true);
  });

  it('is unconfigured without GEMINI_API_KEY', () => {
    const original = process.env.GEMINI_API_KEY;
    try {
      delete process.env.GEMINI_API_KEY;
      const adapter = new GeminiAdapter();
      expect(adapter.isConfigured()).toBe(false);
    } finally {
      if (original === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = original;
    }
  });
});
