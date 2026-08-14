import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: env.openrouterApiKey,
      // OpenRouter's official free router automatically selects a currently
      // available free model and is the safest zero-cost default.
      defaultModel: 'openrouter/free',
      extraHeaders: {
        'HTTP-Referer': 'https://github.com/ai-gateway',
        'X-Title': 'AI Gateway',
      },
      maxOutputTokens: 16384,
    });
  }
}
