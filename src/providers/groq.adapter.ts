import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class GroqAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: env.groqApiKey,
      defaultModel: 'llama-3.3-70b-versatile',
      // Verified against Groq's own docs: llama-3.3-70b-versatile caps
      // output at 32,768 tokens.
      maxOutputTokens: 32768,
    });
  }
}
