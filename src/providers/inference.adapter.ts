import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class InferenceAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'inference',
      baseUrl: 'https://api.inference.net/v1',
      apiKey: env.inferenceApiKey,
      defaultModel: 'meta-llama/llama-3.3-70b-instruct/fp-8',
      maxOutputTokens: 8192,
    });
  }
}
