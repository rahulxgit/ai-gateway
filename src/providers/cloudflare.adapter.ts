import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class CloudflareAdapter extends OpenAICompatibleAdapter {
  constructor() {
    const accountId = env.cloudflareAccountId;
    super({
      name: 'cloudflare',
      baseUrl: accountId
        ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`
        : 'https://api.cloudflare.com/client/v4/accounts/unset/ai/v1',
      apiKey: env.cloudflareApiKey,
      // Cloudflare narrowed Workers Free plan access on 2026-07-28: several
      // resource-intensive models (kimi-k2.6, kimi-k2.7-code, glm-5.2) now
      // require Workers Paid and return 403 on the free plan. The old
      // llama-3.3-70b-instruct default was never confirmed either way in
      // that changelog, so it's swapped for a model Cloudflare's own
      // changelog explicitly lists as still available on Workers Free:
      // https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/
      defaultModel: '@cf/google/gemma-4-26b-a4b-it',
      freeModels: ['@cf/google/gemma-4-26b-a4b-it'],
      maxOutputTokens: 4096,
    });
  }

  isConfigured(): boolean {
    return Boolean(env.cloudflareApiKey && env.cloudflareAccountId);
  }
}
