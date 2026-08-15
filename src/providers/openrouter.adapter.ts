import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

/** OpenRouter's dynamic free router; the selected concrete model can change per request. */
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
      // `openrouter/free` dynamically selects the concrete free model, so do
      // not pretend that one model-specific output ceiling applies to every
      // routed target. This is only a gateway safety ceiling; normal requests
      // still default to the much smaller 1024-token budget in the shared
      // adapter, while explicit maxTokens can use up to this envelope.
      maxOutputTokens: 65536,
      freeModels: [OPENROUTER_FREE_MODEL],
    });
  }
}
