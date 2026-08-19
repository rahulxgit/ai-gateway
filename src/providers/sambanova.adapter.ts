import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class SambaNovaAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'sambanova',
      baseUrl: 'https://api.sambanova.ai/v1',
      apiKey: env.sambanovaApiKey,
      defaultModel: 'Meta-Llama-3.3-70B-Instruct',
      // SambaNova's RDU hardware supports up to a 256K context window on
      // some models; output is conservatively bounded well under that.
      maxOutputTokens: 8192,
      // Audited 2026-08-19: SambaNova Cloud's free developer tier is
      // genuinely recurring — no card required, rate-limited (RPM cap)
      // access across its hosted models rather than a one-time credit —
      // unlike most of the other providers audited alongside this one.
      freeModels: ['Meta-Llama-3.3-70B-Instruct'],
    });
  }
}
