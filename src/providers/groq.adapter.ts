import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class GroqAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: env.groqApiKey,
      // Free-plan default. GPT-OSS 20B is a current Groq model and avoids
      // the retired Llama-4 default that previously generated model errors.
      defaultModel: 'openai/gpt-oss-20b',
      maxOutputTokens: 8192,
    });
  }
}
