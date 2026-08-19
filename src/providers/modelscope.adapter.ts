import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class ModelScopeAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'modelscope',
      baseUrl: 'https://api-inference.modelscope.cn/v1',
      apiKey: env.modelscopeApiKey,
      defaultModel: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
      maxOutputTokens: 8192,
      // Verified live 2026-08-19 via GET /v1/models with an active key.
      // Old default 'Qwen/Qwen2.5-72B-Instruct' is NOT in the current
      // catalog — fully retired, would have 404'd. Replaced with
      // Qwen3.5/Qwen3-series models confirmed present in the live response.
      freeModels: [
        'Qwen/Qwen3-235B-A22B-Instruct-2507',
        'Qwen/Qwen3.5-397B-A17B',
        'Qwen/Qwen3.5-122B-A10B',
        'Qwen/Qwen3-Coder-30B-A3B-Instruct',
        'Qwen/Qwen3-Next-80B-A3B-Instruct',
        'ZhipuAI/GLM-5.2',
        'deepseek-ai/DeepSeek-V4-Pro',
      ],
    });
  }
}