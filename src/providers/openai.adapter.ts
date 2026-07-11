import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class OpenAIAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: env.openaiApiKey,
      // gpt-5-nano is OpenAI's cheapest current model ($0.05/$0.40 per 1M
      // tokens) — OpenAI has no free tier at all regardless of model choice,
      // so minimizing per-token cost is the only lever available here.
      defaultModel: 'gpt-5-nano',
    });
  }
}
