import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class NvidiaAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: env.nvidiaApiKey,
      // NVIDIA API trial/free access has a current GPT-OSS 20B model; keep
      // this as the default for the free-oriented gateway.
      defaultModel: 'openai/gpt-oss-20b',
      maxOutputTokens: 8192,
      requestTimeoutMs: 90_000,
    });
  }
}
