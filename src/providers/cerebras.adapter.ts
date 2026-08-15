import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class CerebrasAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'cerebras',
      baseUrl: 'https://api.cerebras.ai/v1',
      apiKey: env.cerebrasApiKey,
      defaultModel: 'gpt-oss-120b',
      freeModels: ['gpt-oss-120b'],
      maxOutputTokens: 40960,
    });
  }
}
