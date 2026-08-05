import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class NebiusAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'nebius',
      baseUrl: `https://api.studio.nebius.ai/v1`,
      apiKey: env.nebiusApiKey,
      defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
      maxOutputTokens: 8192,
    });
  }

}
