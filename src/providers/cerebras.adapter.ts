import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

// Cerebras's free tier is genuinely no-cost and no-card: 1M tokens/day,
// resets daily, running on their wafer-scale inference hardware which is
// dramatically faster than typical GPU-based providers. The catch: their
// free model catalog rotates over time, so defaultModel may need updating
// occasionally — check cloud.cerebras.ai for current offerings.
export class CerebrasAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'cerebras',
      baseUrl: 'https://api.cerebras.ai/v1',
      apiKey: env.cerebrasApiKey,
      defaultModel: 'llama-3.3-70b',
    });
  }
}
