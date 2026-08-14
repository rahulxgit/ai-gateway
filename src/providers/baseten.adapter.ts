import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class BasetenAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'baseten',
      baseUrl: 'https://inference.baseten.co/v1',
      apiKey: env.basetenApiKey,
      // Current Baseten Model APIs example model. Baseten remains paid/trial
      // and is intentionally excluded from automatic free routing.
      defaultModel: 'deepseek-ai/DeepSeek-V4-Pro',
      maxOutputTokens: 8192,
    });
  }
}
