import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class AimlapiAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'aimlapi',
      baseUrl: 'https://api.aimlapi.com/v1',
      apiKey: env.aimlapiApiKey,
      defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      maxOutputTokens: 8192,
    });
  }
}
