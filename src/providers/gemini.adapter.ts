import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class GeminiAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: env.geminiApiKey,
      defaultModel: 'gemini-3.1-flash-lite',
      freeModels: ['gemini-3.1-flash-lite'],
      supportsVision: true,
      maxOutputTokens: 65536,
      sendTemperature: false,
    });
  }
}
