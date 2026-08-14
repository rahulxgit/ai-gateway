import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class SambaNovaAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'sambanova',
      baseUrl: 'https://api.sambanova.ai/v1',
      apiKey: env.sambanovaApiKey,
      // Keep a current general model as the default. SambaNova access tier
      // determines whether the account can invoke it; automatic routing is
      // limited to providers classified as free-tier in routing.ts.
      defaultModel: 'DeepSeek-V3.2',
      maxOutputTokens: 8192,
    });
  }
}
