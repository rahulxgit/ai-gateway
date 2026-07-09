import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class GroqAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: env.groqApiKey,
      defaultModel: 'llama-3.3-70b-versatile',
    });
  }
}
