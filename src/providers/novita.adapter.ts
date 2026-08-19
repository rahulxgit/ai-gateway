import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class NovitaAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'novita',
      baseUrl: 'https://api.novita.ai/openai/v1',
      apiKey: env.novitaApiKey,
      defaultModel: 'meta-llama/llama-3.3-70b-instruct',
      maxOutputTokens: 12288,
      // TODO(verify): audited 2026-08-19 — Novita's signup grant is a
      // one-time ~$0.50 voucher, not a recurring free tier. Novita does
      // publish a handful of genuinely $0/token open-weight models
      // separate from that voucher, but the currently configured
      // llama-3.3-70b-instruct default is NOT confirmed to be one of them —
      // left out of freeModels rather than guessing. Re-check Novita's
      // model catalog for a $0-priced row before adding one here.
    });
  }
}
