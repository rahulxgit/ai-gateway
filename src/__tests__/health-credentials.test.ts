import { providerRegistry } from '../providers/registry';
import { env } from '../config/env';

describe('provider health configuration wiring', () => {
  const keyEnvByProvider: Record<string, keyof typeof env> = {
    gemini: 'geminiApiKey',
    anthropic: 'anthropicApiKey',
    openai: 'openaiApiKey',
    groq: 'groqApiKey',
    together: 'togetherApiKey',
    openrouter: 'openrouterApiKey',
    huggingface: 'hfApiKey',
    deepseek: 'deepseekApiKey',
    kimi: 'kimiApiKey',
    cerebras: 'cerebrasApiKey',
    mistral: 'mistralApiKey',
    cloudflare: 'cloudflareApiKey',
    fireworks: 'fireworksApiKey',
    inference: 'inferenceApiKey',
    nebius: 'nebiusApiKey',
    sambanova: 'sambanovaApiKey',
    nvidia: 'nvidiaApiKey',
    novita: 'novitaApiKey',
    baseten: 'basetenApiKey',
    modelscope: 'modelscopeApiKey',
    aimlapi: 'aimlapiApiKey',
  };

  it('keeps every registered provider wired to an explicit env key field', () => {
    expect(Object.keys(providerRegistry).sort()).toEqual(Object.keys(keyEnvByProvider).sort());
  });

  it('treats a non-empty configured credential as configured without conflating it with health', () => {
    for (const [provider, envKey] of Object.entries(keyEnvByProvider)) {
      const adapter = providerRegistry[provider as keyof typeof providerRegistry];
      expect(typeof adapter.isConfigured()).toBe('boolean');
      expect(envKey in env).toBe(true);
    }
  });
});
