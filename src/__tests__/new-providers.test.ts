import { providerRegistry, listAllProviders } from '../providers/registry';
import { PRICING_PER_1K_TOKENS, FREE_AUTO_PROVIDERS, DEFAULT_FAILOVER_ORDER } from '../config/routing';
import { ProviderName } from '../types';

const NEW_PROVIDERS: ProviderName[] = [
  'cloudflare',
  'fireworks',
  'inference',
  'nebius',
  'sambanova',
  'nvidia',
  'novita',
  'baseten',
  'modelscope',
  'aimlapi',
];

describe('newly added providers', () => {
  it('are all present in the provider registry', () => {
    for (const name of NEW_PROVIDERS) {
      expect(providerRegistry[name]).toBeDefined();
      expect(providerRegistry[name].name).toBe(name);
    }
  });

  it('are all present in listAllProviders()', () => {
    const all = listAllProviders();
    for (const name of NEW_PROVIDERS) expect(all).toContain(name);
  });

  it('each expose a non-empty default model and a sane maxOutputTokens', () => {
    for (const name of NEW_PROVIDERS) {
      expect(providerRegistry[name].defaultModel.length).toBeGreaterThan(0);
      expect(providerRegistry[name].maxOutputTokens).toBeGreaterThan(0);
    }
  });

  it('have a pricing entry so analytics/cost estimation does not break', () => {
    for (const name of NEW_PROVIDERS) {
      expect(PRICING_PER_1K_TOKENS[name]).toBeDefined();
      expect(typeof PRICING_PER_1K_TOKENS[name]).toBe('number');
    }
  });

  it('keeps automatic routing restricted to the free pool', () => {
    for (const name of FREE_AUTO_PROVIDERS) expect(DEFAULT_FAILOVER_ORDER).toContain(name);
    for (const name of NEW_PROVIDERS) {
      if (!FREE_AUTO_PROVIDERS.includes(name)) expect(DEFAULT_FAILOVER_ORDER).not.toContain(name);
    }
  });

  it('keeps paid/credit-dependent providers available for explicit selection only', () => {
    expect(FREE_AUTO_PROVIDERS).not.toContain('openai');
    expect(FREE_AUTO_PROVIDERS).not.toContain('anthropic');
    expect(FREE_AUTO_PROVIDERS).not.toContain('deepseek');
    expect(FREE_AUTO_PROVIDERS).not.toContain('huggingface');
  });

  it('cloudflare requires both an API key and an account id to be configured', async () => {
    const original = { key: process.env.CLOUDFLARE_API_KEY, acct: process.env.CLOUDFLARE_ACCOUNT_ID };
    try {
      process.env.CLOUDFLARE_API_KEY = 'test-key';
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      jest.resetModules();
      const { CloudflareAdapter } = await import('../providers/cloudflare.adapter');
      expect(new CloudflareAdapter().isConfigured()).toBe(false);
    } finally {
      if (original.key === undefined) delete process.env.CLOUDFLARE_API_KEY;
      else process.env.CLOUDFLARE_API_KEY = original.key;
      if (original.acct === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = original.acct;
      jest.resetModules();
    }
  });
});
