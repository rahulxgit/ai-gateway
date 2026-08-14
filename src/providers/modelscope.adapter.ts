import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class ModelScopeAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'modelscope',
      baseUrl: 'https://api-inference.modelscope.cn/v1',
      apiKey: env.modelscopeApiKey,
      // Current Qwen3 family model used by ModelScope's OpenAI-compatible
      // inference service. The provider account/quota remains the source of
      // truth for whether the user's token can invoke it.
      defaultModel: 'Qwen/Qwen3-32B',
      maxOutputTokens: 8192,
    });
  }
}
