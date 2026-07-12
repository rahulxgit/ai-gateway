import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

// DeepSeek's API is OpenAI-compatible. New accounts get 5M free tokens with
// no card required; after that it's roughly $0.14/M input tokens — genuinely
// one of the cheapest strong coding/reasoning models available as of 2026.
//
// ⚠️ TIME-SENSITIVE: the "deepseek-chat" model ID is scheduled for
// deprecation on 2026-07-24. It currently routes internally to
// deepseek-v4-flash's non-thinking mode, so requests work fine today, but
// after that date this exact model string will start failing outright.
// Migration is a one-line change (same base URL) to "deepseek-v4-flash" —
// worth doing before the deadline rather than waiting for it to break.
export class DeepSeekAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: env.deepseekApiKey,
      defaultModel: 'deepseek-chat',
      // Verified against DeepSeek's docs: deepseek-chat's output is capped
      // at 8,000 tokens (default 4,000, expandable to 8,000 via max_tokens)
      // — notably lower than this gateway's other providers.
      maxOutputTokens: 8000,
    });
  }
}
