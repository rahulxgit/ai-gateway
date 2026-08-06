import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

// Cloudflare Workers AI exposes an OpenAI-compatible endpoint scoped to a
// Cloudflare account: /client/v4/accounts/{account_id}/ai/v1. Both the API
// token and the account id are required for this adapter to be usable.
export class CloudflareAdapter extends OpenAICompatibleAdapter {
  constructor() {
    const accountId = env.cloudflareAccountId;
    super({
      name: 'cloudflare',
      baseUrl: accountId
        ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`
        : 'https://api.cloudflare.com/client/v4/accounts/unset/ai/v1',
      apiKey: env.cloudflareApiKey,
      defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      // Cloudflare's free daily neuron allocation caps output well below
      // most providers here; kept conservative to avoid over-requesting.
      maxOutputTokens: 4096,
    });
  }

  // Requires both the API token and account id — falls back to "not
  // configured" if either is missing so the router skips it cleanly.
  isConfigured(): boolean {
    return Boolean(env.cloudflareApiKey && env.cloudflareAccountId);
  }
}
