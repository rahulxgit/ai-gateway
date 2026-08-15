import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class GroqAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: env.groqApiKey,
      defaultModel: 'qwen/qwen3.6-27b',
      freeModels: ['qwen/qwen3.6-27b'],
      maxOutputTokens: 16384,
      extraBodyParams: { reasoning_format: 'hidden' },
    });
  }
}
