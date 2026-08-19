import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

// Baseten's "Model APIs" product exposes hosted open models behind an
// OpenAI-compatible endpoint, separate from its custom-deployment endpoints.
export class BasetenAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'baseten',
      baseUrl: 'https://inference.baseten.co/v1',
      apiKey: env.basetenApiKey,
      // 'meta-llama/Llama-3.3-70B-Instruct' is no longer in Baseten's Model
      // APIs catalog (confirmed via GET /v1/models on 2026-08-18 — it 404s).
      // Swapped for openai/gpt-oss-120b: cheapest current model on the
      // catalog ($0.0000001/$0.0000005 per token) and functionally
      // equivalent as a general-purpose default.
      defaultModel: 'openai/gpt-oss-120b',
      maxOutputTokens: 8192,
      // TODO(verify): audited 2026-08-19 — no evidence of a recurring
      // free/no-card tier for Baseten's Model APIs product; it's
      // pay-as-you-go from the first token with sign-up credit programs
      // rather than a standing $0 tier. Not added to freeModels.
    });
  }
}
