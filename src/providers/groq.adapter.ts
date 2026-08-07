import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { env } from '../config/env';

export class GroqAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: env.groqApiKey,
      // Switched from openai/gpt-oss-120b (8,000 TPM free tier) to
      // llama-4-scout-17b-16e-instruct, which has the highest TPM on
      // Groq's free tier (30,000 TPM) — ~3.75x more headroom, reducing
      // false-positive 413/TPM errors from large orchestrator-injected
      // context payloads.
      defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
      // Verified against Groq's own docs: llama-3.3-70b-versatile caps
      // output at 32,768 tokens.
      maxOutputTokens: 32768,
    });
  }
}
