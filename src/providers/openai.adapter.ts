import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class OpenAIAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: env.openaiApiKey,
      defaultModel: 'gpt-4o-mini',
    });
  }
}
