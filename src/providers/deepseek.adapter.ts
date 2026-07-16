import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

// DeepSeek's API is OpenAI-compatible. New accounts get 5M free tokens with
// no card required; after that it's roughly $0.14/$0.28 per 1M input/output
// tokens — genuinely one of the cheapest strong coding/reasoning models
// available as of 2026.
//
// Migrated from "deepseek-chat" to "deepseek-v4-flash" ahead of the former's
// 2026-07-24 deprecation deadline. Verified as the correct stable
// replacement (not a preview) with published pricing and a 1M-token context
// window — a real upgrade, not just a rename: max output rose from 8,000 to
// 384,000 tokens.
//
// Known behavioral difference: v4-flash defaults to "thinking mode" on,
// unlike deepseek-chat's non-thinking default. This adapter doesn't
// currently send DeepSeek's provider-specific `thinking` control param (the
// OpenAI-compatible base class only sends standard fields), so expect
// slightly higher latency/cost per request than the old deepseek-chat
// baseline until that's added.
export class DeepSeekAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: env.deepseekApiKey,
      defaultModel: 'deepseek-v4-flash',
      // Verified against DeepSeek's docs: deepseek-v4-flash supports up to
      // 384,000 output tokens.
      maxOutputTokens: 384000,
    });
  }
}
