import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class MistralAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'mistral',
      baseUrl: 'https://api.mistral.ai/v1',
      apiKey: env.mistralApiKey,
      defaultModel: 'mistral-small-latest',
      freeModels: ['mistral-small-latest'],
      maxOutputTokens: 64000,
    });
  }
}
