import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class TogetherAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'together',
      baseUrl: 'https://api.together.xyz/v1',
      apiKey: env.togetherApiKey,
      defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    });
  }
}
