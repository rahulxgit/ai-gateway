import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class FireworksAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'fireworks',
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      apiKey: env.fireworksApiKey,
      // Llama 3.x was fully retired from Fireworks' serverless catalog
      // (confirmed live against a real account on 2026-08-07 — GET /v1/models
      // returned zero "llama" matches). Current catalog is GLM, Kimi,
      // MiniMax, GPT-OSS, DeepSeek v4, Qwen3, and Nemotron. gpt-oss-120b is
      // used here to match the default already used by the Cerebras adapter.
      defaultModel: 'accounts/fireworks/models/gpt-oss-120b',
      maxOutputTokens: 32768,
    });
  }
}
