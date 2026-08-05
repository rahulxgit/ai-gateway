import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class AimlApiAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'aimlapi',
      baseUrl: `https://api.aimlapi.com/v1`,
      apiKey: env.aimlApiKey,
      defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      maxOutputTokens: 8192,
    });
  }

}
