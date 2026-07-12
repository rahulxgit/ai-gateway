import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class TogetherAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'together',
      baseUrl: 'https://api.together.xyz/v1',
      apiKey: env.togetherApiKey,
      defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      // Together doesn't publish a separate output cap for this model —
      // output is bounded only by the 131K context window (one listing
      // explicitly shows "Max output: Unlimited"). 64000 leaves ample
      // room within that context alongside a typical prompt.
      maxOutputTokens: 64000,
    });
  }
}
