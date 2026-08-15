import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

/**
 * Google Gemini adapter.
 *
 * Gemini exposes an OpenAI-compatible Chat Completions endpoint, so this
 * provider intentionally reuses the gateway's shared OpenAI-compatible
 * transport for consistent streaming, model discovery, error classification,
 * and failover behavior.
 *
 * Free-tier strategy: use the current GA Gemini 3.1 Flash-Lite model as the
 * default because Google documents it as optimized for high-volume,
 * lightweight workloads and makes it available in the Gemini API free tier.
 * Quotas are project-level and dynamic, so the gateway must not hard-code a
 * universal RPM/TPM/RPD value or multiply capacity by API-key count.
 */
export class GeminiAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: env.geminiApiKey,
      defaultModel: 'gemini-3.1-flash-lite',
      supportsVision: true,
      maxOutputTokens: 65536,
      sendTemperature: false,
    });
  }
}
