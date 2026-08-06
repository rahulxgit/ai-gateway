import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class SambaNovaAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'sambanova',
      baseUrl: 'https://api.sambanova.ai/v1',
      apiKey: env.sambanovaApiKey,
      defaultModel: 'Meta-Llama-3.3-70B-Instruct',
      // SambaNova's RDU hardware supports up to a 256K context window on
      // some models; output is conservatively bounded well under that.
      maxOutputTokens: 8192,
    });
  }
}
