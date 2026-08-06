import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class FireworksAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'fireworks',
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      apiKey: env.fireworksApiKey,
      defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
      // Fireworks' 131K-context Llama 3.3 listing has no separate output
      // cap published; kept well within the context window.
      maxOutputTokens: 32768,
    });
  }
}
