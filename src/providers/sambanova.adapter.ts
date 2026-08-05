import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class SambaNovaAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'sambanova',
      baseUrl: `https://api.sambanova.ai/v1`,
      apiKey: env.sambanovaApiKey,
      defaultModel: 'Meta-Llama-3.3-70B-Instruct',
      maxOutputTokens: 8192,
    });
  }

}
