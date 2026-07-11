import { ProviderAdapter, ProviderName } from '../types';
import { GeminiAdapter } from './gemini.adapter';
import { AnthropicAdapter } from './anthropic.adapter';
import { OpenAIAdapter } from './openai.adapter';
import { GroqAdapter } from './groq.adapter';
import { TogetherAdapter } from './together.adapter';
import { OpenRouterAdapter } from './openrouter.adapter';
import { HuggingFaceAdapter } from './huggingface.adapter';
import { DeepSeekAdapter } from './deepseek.adapter';
import { KimiAdapter } from './kimi.adapter';
import { CerebrasAdapter } from './cerebras.adapter';
import { MistralAdapter } from './mistral.adapter';

// Single source of truth for every provider instance. To add a new
// provider: write an adapter implementing ProviderAdapter, instantiate it
// here, and add its name to the ProviderName union in types/index.ts.
// Nothing else in the codebase needs to change.
export const providerRegistry: Record<ProviderName, ProviderAdapter> = {
  gemini: new GeminiAdapter(),
  anthropic: new AnthropicAdapter(),
  openai: new OpenAIAdapter(),
  groq: new GroqAdapter(),
  together: new TogetherAdapter(),
  openrouter: new OpenRouterAdapter(),
  huggingface: new HuggingFaceAdapter(),
  deepseek: new DeepSeekAdapter(),
  kimi: new KimiAdapter(),
  cerebras: new CerebrasAdapter(),
  mistral: new MistralAdapter(),
};

export function getProvider(name: ProviderName): ProviderAdapter {
  return providerRegistry[name];
}

export function listConfiguredProviders(): ProviderName[] {
  return (Object.keys(providerRegistry) as ProviderName[]).filter((name) =>
    providerRegistry[name].isConfigured()
  );
}

export function listAllProviders(): ProviderName[] {
  return Object.keys(providerRegistry) as ProviderName[];
}
