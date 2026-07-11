import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

// DeepSeek's API is OpenAI-compatible. New accounts get 5M free tokens with
// no card required; after that it's roughly $0.14/M input tokens — genuinely
// one of the cheapest strong coding/reasoning models available as of 2026.
export class DeepSeekAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: env.deepseekApiKey,
      // deepseek-chat/deepseek-reasoner are being retired in favor of these
      // explicit model IDs — deepseek-chat maps to non-thinking mode.
      defaultModel: 'deepseek-chat',
    });
  }
}
