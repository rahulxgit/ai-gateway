import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class GroqAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: env.groqApiKey,
      // meta-llama/llama-4-scout-17b-16e-instruct was deprecated by Groq on
      // 2026-06-17 and is no longer served (causes "model not found").
      // Per Groq's own deprecation notice, migrating to
      // qwen/qwen3.6-27b (Groq's other recommended replacement besides
      // openai/gpt-oss-120b, which was our original 8K-TPM default and
      // the reason we moved off it in the first place).
      defaultModel: 'qwen/qwen3.6-27b',
      // Groq caps max_tokens at 16,384 for qwen/qwen3.6-27b specifically
      // (confirmed via a live 400: "`max_tokens` must be less than or
      // equal to `16384`"). This was stale at 32,768 — a leftover from an
      // earlier default model — which meant every single request was
      // rejected outright and silently failed over to the next provider.
      maxOutputTokens: 16384,
      // qwen/qwen3.6-27b is a reasoning model that, by default, emits its
      // internal chain-of-thought inline in the content field wrapped in
      // <think>...</think> tags (Groq's "raw" format). "hidden" returns
      // only the final answer — verified against Groq's own docs for this
      // model. (Note: reasoning_effort='none' would fully disable
      // reasoning instead, but hidden is the more conservative choice —
      // it keeps the model's actual reasoning quality, just hides it from
      // the visible response.)
      extraBodyParams: { reasoning_format: 'hidden' },
    });
  }
}
