import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

/**
 * OpenRouter's `openrouter/free` model is a dynamic router over the currently
 * available free-variant models. It is intentionally used as the gateway's
 * default instead of pinning to a single model whose availability or pricing
 * can change independently of this adapter.
 */
export const OPENROUTER_FREE_MODEL = 'openrouter/free';

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: env.openrouterApiKey,
      defaultModel: OPENROUTER_FREE_MODEL,
      extraHeaders: {
        'HTTP-Referer': 'https://github.com/ai-gateway',
        'X-Title': 'AI Gateway',
      },
      // OpenRouter's free router currently advertises a 200K context window;
      // requests are still clamped by the concrete model selected upstream.
      maxOutputTokens: 16384,
      freeModels: [OPENROUTER_FREE_MODEL],
    });
  }
}
