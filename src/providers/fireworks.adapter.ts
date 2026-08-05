import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class FireworksAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'fireworks',
      baseUrl: `https://api.fireworks.ai/inference/v1`,
      apiKey: env.fireworksApiKey,
      defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
      maxOutputTokens: 8192,
    });
  }

}
