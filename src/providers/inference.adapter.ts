import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

// meta-llama/llama-3.3-70b-instruct/fp-8 was confirmed dead via a live
// GET /v1/models call against a real account (2026-08-08) — inference.net
// has fully retired the Llama 3.x line from their catalog, same pattern as
// what happened with Fireworks (see PROJECT_OVERVIEW.md). The live catalog
// is now built around their own "schematron" model family instead:
// inference-net/schematron-v2-small and inference-net/schematron-v2-turbo.
// -turbo is used here as the general-purpose default, consistent with this
// gateway's existing convention of defaulting to a mid/general tier rather
// than the cheapest one. Not independently verified against inference.net's
// docs for a real maxOutputTokens ceiling on this model — the /models
// response didn't return per-model output limits — so the previous
// conservative 8192 default is kept rather than guessed upward.
export class InferenceAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'inference',
      baseUrl: 'https://api.inference.net/v1',
      apiKey: env.inferenceApiKey,
      defaultModel: 'inference-net/schematron-v2-turbo',
      maxOutputTokens: 8192,
      // TODO(verify): audited 2026-08-19 — inference.net advertises a
      // "free tier" for initial evaluation in marketing copy, but no
      // canonical pricing page confirms a specific $0/token model vs. a
      // time/credit-limited trial. Not added to freeModels without a
      // clearer source; re-check inference.net's own docs directly.
    });
  }
}
