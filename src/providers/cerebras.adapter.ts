import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

// Cerebras's free tier is genuinely no-cost and no-card: 1M tokens/day,
// resets daily, running on their wafer-scale inference hardware which is
// dramatically faster than typical GPU-based providers. Their free model
// catalog rotates over time (llama-3.3-70b, for example, was deprecated
// Feb 2026) — check cloud.cerebras.ai/models if requests start failing
// with an invalid-model error.
export class CerebrasAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'cerebras',
      baseUrl: 'https://api.cerebras.ai/v1',
      apiKey: env.cerebrasApiKey,
      defaultModel: 'gpt-oss-120b',
      // Verified against Cerebras's own model config for this exact model:
      // 131,072 token context window, 40,960 max output tokens.
      maxOutputTokens: 40960,
    });
  }
}
