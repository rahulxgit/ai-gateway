import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

// Moonshot's Kimi API is OpenAI-compatible. Not free-forever like some
// others in this gateway — requires a minimum $1 recharge to activate —
// but very cheap after that and strong on long-context and coding tasks.
// kimi-k2.6 is the currently recommended flagship as of mid-2026; the
// older hyphenated "kimi-k2"/"kimi-k2-0905" series is being discontinued.
export class KimiAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'kimi',
      baseUrl: 'https://api.moonshot.ai/v1',
      apiKey: env.kimiApiKey,
      defaultModel: 'kimi-k2.6',
      // Not individually verified against Moonshot's real ceiling for this
      // model — kept conservative. Raise if you confirm a higher limit.
      maxOutputTokens: 8192,
    });
  }
}
