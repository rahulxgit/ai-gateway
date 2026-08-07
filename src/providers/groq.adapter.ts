import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class GroqAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: env.groqApiKey,
      // meta-llama/llama-4-scout-17b-16e-instruct was deprecated by Groq on
      // 2026-06-17 and is no longer served (causes "model not found").
      // Per Groq's own deprecation notice, migrating to
      // qwen/qwen3.6-27b (Groq's other recommended replacement besides
      // openai/gpt-oss-120b, which was our original 8K-TPM default and
      // the reason we moved off it in the first place).
      defaultModel: 'qwen/qwen3.6-27b',
      // Verified against Groq's own docs: llama-3.3-70b-versatile caps
      // output at 32,768 tokens.
      maxOutputTokens: 32768,
    });
  }
}
