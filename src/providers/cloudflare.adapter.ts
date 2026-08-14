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
      // Current Workers Free-plan model explicitly documented as remaining
      // available after Cloudflare moved several larger models to Paid.
      defaultModel: '@cf/zai-org/glm-4.7-flash',
      maxOutputTokens: 4096,
    });
  }

  isConfigured(): boolean {
    return Boolean(env.cloudflareApiKey && env.cloudflareAccountId);
  }
}
