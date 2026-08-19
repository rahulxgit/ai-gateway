import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class AimlapiAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'aimlapi',
      baseUrl: 'https://api.aimlapi.com/v1',
      apiKey: env.aimlapiApiKey,
      defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      maxOutputTokens: 8192,
      // TODO(verify): audited 2026-08-19 — AI/ML API is a paid aggregator
      // (pass-through pricing across many upstream providers); no
      // confirmed recurring free tier for chat completions specifically.
      // Not added to freeModels.
    });
  }
}
