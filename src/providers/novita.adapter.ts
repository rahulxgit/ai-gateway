import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class NovitaAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'novita',
      baseUrl: `https://api.novita.ai/v3/openai`,
      apiKey: env.novitaApiKey,
      defaultModel: 'meta-llama/llama-3.3-70b-instruct',
      maxOutputTokens: 8192,
    });
  }

}
