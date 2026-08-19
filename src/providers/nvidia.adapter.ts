import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class NvidiaAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: env.nvidiaApiKey,
      defaultModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      maxOutputTokens: 8192,
      // NVIDIA NIM's free tier can cold-start this model very slowly —
      // measured live at ~61s for a two-word prompt, well past the
      // gateway's global 30s default (env.requestTimeoutMs), which meant
      // every request here hit TIMEOUT and failed over before the model
      // ever finished responding. 90s gives real headroom above the
      // observed worst case without being unbounded. This only affects
      // nvidia — the global timeout used by every other provider is
      // untouched, so real outages on other providers still fail over
      // at the normal speed.
      requestTimeoutMs: 90_000,
      // Confirmed live on the model's build.nvidia.com card (checked
      // 2026-08-19): "Free Endpoint: Available" alongside the paid
      // partner-endpoint option — the default model here is the free one.
      freeModels: ['nvidia/nemotron-3.5-lightning-30b-a3b'],
    });
  }
}
