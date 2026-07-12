import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

// Mistral's La Plateforme "Experiment" tier is free with no card required,
// covering all their models including Codestral (code-specialized) and
// Mistral Large. EU-hosted, which is also a nice property if data
// residency ever matters for a project built on this gateway.
export class MistralAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'mistral',
      baseUrl: 'https://api.mistral.ai/v1',
      apiKey: env.mistralApiKey,
      defaultModel: 'mistral-small-latest',
      // Mistral doesn't publish a separate output cap for Small 4 — docs
      // state input+output share the 256K context budget with no distinct
      // lower output ceiling found. 64000 leaves ample room within that
      // shared budget alongside a typical prompt.
      maxOutputTokens: 64000,
    });
  }
}
