import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

// Baseten's "Model APIs" product exposes hosted open models behind an
// OpenAI-compatible endpoint, separate from its custom-deployment endpoints.
export class BasetenAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'baseten',
      baseUrl: 'https://inference.baseten.co/v1',
      apiKey: env.basetenApiKey,
      defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
      maxOutputTokens: 8192,
    });
  }
}
