import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

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
      // This is a gateway safety ceiling, not a claim about every concrete
      // model behind openrouter/free. The actual dynamic model may support a
      // different output limit; normal requests remain at 1024 unless the
      // caller explicitly requests more.
      maxOutputTokens: 16384,
      freeModels: [OPENROUTER_FREE_MODEL],
    });
  }
}
