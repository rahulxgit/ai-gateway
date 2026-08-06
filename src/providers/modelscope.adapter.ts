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
    });
  }
}
