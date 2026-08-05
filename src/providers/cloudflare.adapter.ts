import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class CloudflareAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'cloudflare',
      baseUrl: `https://api.cloudflare.com/client/v4/accounts/${env.cloudflareAccountId}/ai/v1`,
      apiKey: env.cloudflareApiKey,
      defaultModel: '@cf/meta/llama-3.3-70b-instruct-awq',
      maxOutputTokens: 8192,
    });
  }
  isConfigured(): boolean {
    return Boolean(env.cloudflareApiKey && env.cloudflareAccountId);
  }
}
