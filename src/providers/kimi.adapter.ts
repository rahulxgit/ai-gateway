import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

// Moonshot's Kimi API is OpenAI-compatible. Not free-forever like some
// others in this gateway — requires a minimum $1 recharge to activate —
// but very cheap after that and strong on long-context and coding tasks.
export class KimiAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'kimi',
      baseUrl: 'https://api.moonshot.ai/v1',
      apiKey: env.kimiApiKey,
      defaultModel: 'kimi-k2.5',
    });
  }
}
