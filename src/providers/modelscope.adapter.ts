import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class ModelScopeAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'modelscope',
      baseUrl: 'https://api-inference.modelscope.cn/v1',
      apiKey: env.modelscopeApiKey,
      defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
      maxOutputTokens: 8192,
      // Audited 2026-08-19: ModelScope's API-Inference tier is genuinely
      // free — 2,000 requests/day total (500/day per model, dynamic), no
      // credit card, resets daily. Confirmed the tier itself is real;
      // TODO(verify): the currently configured Qwen2.5-72B-Instruct default
      // may be stale — public sources as of this audit reference
      // Qwen3.5-series models as the current free-tier catalog headline.
      // Left unchanged rather than swapping on secondhand sources; confirm
      // against a live GET /v1/models call before changing the default.
      freeModels: ['Qwen/Qwen2.5-72B-Instruct'],
    });
  }
}
