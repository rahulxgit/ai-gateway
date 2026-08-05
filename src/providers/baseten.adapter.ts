import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class BasetenAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'baseten',
      baseUrl: `https://bridge.baseten.co/v1`,
      apiKey: env.basetenApiKey,
      defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
      maxOutputTokens: 8192,
    });
  }

}
