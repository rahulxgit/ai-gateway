import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: env.openrouterApiKey,
      defaultModel: 'meta-llama/llama-3.3-70b-instruct',
      extraHeaders: {
        'HTTP-Referer': 'https://github.com/ai-gateway',
        'X-Title': 'AI Gateway',
      },
      // Verified against OpenRouter's own model page for this exact model:
      // 131,072 token context window, 16,384 max output tokens.
      maxOutputTokens: 16384,
    });
  }
}
