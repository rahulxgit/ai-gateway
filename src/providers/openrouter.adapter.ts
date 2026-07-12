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
      // Not individually verified — OpenRouter proxies to whichever backend
      // is currently serving this model, and their real ceilings vary.
      // Kept conservative. Raise if you confirm a higher limit.
      maxOutputTokens: 8192,
    });
  }
}
