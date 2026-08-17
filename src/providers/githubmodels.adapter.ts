import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

// GitHub Models (models.github.ai) is a genuinely free, recurring-quota
// provider — not a one-time trial-credit provider like several others in
// this gateway. Any GitHub account gets an OpenAI-compatible endpoint with
// no card required. Quota is per-model, resets daily at UTC 00:00, and is
// low ("Low" tier models: 50 req/day, "High" tier ~150 req/day, 8K in/4K
// out per request) — intentionally excluded from FREE_AUTO_PROVIDERS
// because the automatic router would burn through it in a handful of
// requests. Use via forceProvider for explicit, deliberate calls.
//
// Auth: a GitHub PAT (classic or fine-grained with "Models" read
// permission) passed as GITHUB_MODELS_API_KEY — kept separate from any PAT
// used for repo/PR automation so scopes stay minimal and this key can be
// rotated independently.
export class GitHubModelsAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'githubmodels',
      baseUrl: 'https://models.github.ai/inference',
      apiKey: env.githubModelsApiKey,
      // gpt-4o-mini sits in GitHub Models' higher-quota "Low" tier
      // (150 req/day) rather than the 50 req/day "High" tier, making it a
      // better default for a gateway that may retry across requests.
      defaultModel: 'openai/gpt-4o-mini',
      supportsVision: true,
      // Published per-request cap: 4,000 output tokens for most chat
      // models on this platform, regardless of tier.
      maxOutputTokens: 4096,
      freeModels: ['openai/gpt-4o-mini', 'openai/gpt-4o', 'meta/llama-3.3-70b-instruct'],
    });
  }
}
