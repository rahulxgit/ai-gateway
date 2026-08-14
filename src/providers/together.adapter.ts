import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class TogetherAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'together',
      // Current Together OpenAI-compatible base URL.
      baseUrl: 'https://api.together.ai/v1',
      apiKey: env.togetherApiKey,
      // Together remains explicitly selectable but is not in automatic
      // free-only routing because the API is pay-as-you-go rather than a
      // guaranteed $0-forever provider.
      defaultModel: 'openai/gpt-oss-20b',
      maxOutputTokens: 8192,
    });
  }
}
