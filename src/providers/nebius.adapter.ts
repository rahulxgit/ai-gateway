import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class NebiusAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'nebius',
      baseUrl: 'https://api.studio.nebius.com/v1',
      apiKey: env.nebiusApiKey,
      defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
      maxOutputTokens: 32768,
      // TODO(verify): audited 2026-08-19 — Nebius AI Studio (rebranded
      // Nebius Token Factory) gives new accounts a one-time ~$1 trial
      // credit, not a recurring free tier. Not added to freeModels.
    });
  }
}
