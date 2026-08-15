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
      defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      freeModels: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
      maxOutputTokens: 4096,
    });
  }

  isConfigured(): boolean {
    return Boolean(env.cloudflareApiKey && env.cloudflareAccountId);
  }
}
