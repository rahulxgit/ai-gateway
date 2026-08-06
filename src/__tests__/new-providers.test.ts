import { providerRegistry, listAllProviders } from '../providers/registry';
import { PRICING_PER_1K_TOKENS, DEFAULT_FAILOVER_ORDER } from '../config/routing';
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

describe('newly added free/free-tier providers', () => {
  it('are all present in the provider registry', () => {
    for (const name of NEW_PROVIDERS) {
      expect(providerRegistry[name]).toBeDefined();
      expect(providerRegistry[name].name).toBe(name);
    }
  });

  it('are all present in listAllProviders()', () => {
    const all = listAllProviders();
    for (const name of NEW_PROVIDERS) {
      expect(all).toContain(name);
    }
  });

  it('each expose a non-empty default model and a sane maxOutputTokens', () => {
    for (const name of NEW_PROVIDERS) {
      const adapter = providerRegistry[name];
      expect(adapter.defaultModel.length).toBeGreaterThan(0);
      expect(adapter.maxOutputTokens).toBeGreaterThan(0);
    }
  });

  it('report unconfigured when no API key env var is set', () => {
    for (const name of NEW_PROVIDERS) {
      expect(providerRegistry[name].isConfigured()).toBe(false);
    }
  });

  it('have a pricing entry so analytics/cost estimation does not break', () => {
    for (const name of NEW_PROVIDERS) {
      expect(PRICING_PER_1K_TOKENS[name]).toBeDefined();
      expect(typeof PRICING_PER_1K_TOKENS[name]).toBe('number');
    }
  });

  it('are appended to the default failover order without disturbing existing providers', () => {
    const originalOrder: ProviderName[] = [
      'gemini',
      'anthropic',
      'deepseek',
      'cerebras',
      'groq',
      'mistral',
      'kimi',
      'together',
      'openrouter',
      'openai',
      'huggingface',
    ];
    // Every previously-existing provider keeps its original relative order.
    const positions = originalOrder.map((p) => DEFAULT_FAILOVER_ORDER.indexOf(p));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
    for (const name of NEW_PROVIDERS) {
      expect(DEFAULT_FAILOVER_ORDER).toContain(name);
    }
  });

  it('cloudflare requires both an API key and an account id to be configured', () => {
    const original = { key: process.env.CLOUDFLARE_API_KEY, acct: process.env.CLOUDFLARE_ACCOUNT_ID };
    try {
      process.env.CLOUDFLARE_API_KEY = 'test-key';
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      jest.resetModules();
      // Re-require after mutating env so a fresh adapter instance picks it up.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { CloudflareAdapter } = require('../providers/cloudflare.adapter');
      const adapter = new CloudflareAdapter();
      expect(adapter.isConfigured()).toBe(false);
    } finally {
      if (original.key === undefined) delete process.env.CLOUDFLARE_API_KEY;
      else process.env.CLOUDFLARE_API_KEY = original.key;
      if (original.acct === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = original.acct;
      jest.resetModules();
    }
  });
});
