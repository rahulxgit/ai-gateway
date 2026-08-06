import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class NvidiaAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: env.nvidiaApiKey,
      defaultModel: 'meta/llama-3.3-70b-instruct',
      maxOutputTokens: 8192,
    });
  }
}
