import axios from 'axios';
import {
  ChatMessage,
  ProviderAdapter,
  ProviderAdapterOptions,
  ProviderResponse,
  StreamChunk,
} from '../types';
import { env } from '../config/env';
import { PRICING_PER_1K_TOKENS } from '../config/routing';
import { classifyError, estimateCost } from './base.adapter';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function toGeminiContents(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        ...(m.images ?? []).map((img) => ({
          inlineData: { mimeType: img.mimeType, data: img.base64 },
        })),
        { text: m.content },
      ],
    }));
}

function systemInstruction(messages: ChatMessage[]) {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  return sys ? { parts: [{ text: sys }] } : undefined;
}

export class GeminiAdapter implements ProviderAdapter {
  readonly name = 'gemini' as const;
  // gemini-2.0-flash was deprecated and shut down March 2026. 2.5 Flash-Lite
  // is Google's cheapest current model ($0.10/$0.40 per 1M tokens) and has
  // the most generous free-tier limits of any Gemini model (15 RPM / 1,000
  // RPD as of mid-2026) — ideal as a default for a free/cheap-first gateway.
  readonly defaultModel = 'gemini-2.5-flash-lite';
  readonly supportsVision = true;

  isConfigured(): boolean {
    return Boolean(env.geminiApiKey);
  }

  async chat(options: ProviderAdapterOptions): Promise<ProviderResponse> {
    const start = Date.now();
    const model = options.model ?? this.defaultModel;

    try {
      const { data } = await axios.post(
        `${BASE_URL}/${model}:generateContent?key=${env.geminiApiKey}`,
        {
          contents: toGeminiContents(options.messages),
          systemInstruction: systemInstruction(options.messages),
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens ?? 4096,
          },
        },
        { timeout: env.requestTimeoutMs }
      );

      const content = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
      const usage = {
        promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      };

      return {
        provider: this.name,
        model,
        content,
        usage,
        latencyMs: Date.now() - start,
        estimatedCostUsd: estimateCost(usage.totalTokens, PRICING_PER_1K_TOKENS.gemini),
        finishReason: data.candidates?.[0]?.finishReason,
      };
    } catch (err) {
      throw classifyError(this.name, err);
    }
  }

  async chatStream(
    options: ProviderAdapterOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ProviderResponse> {
    const start = Date.now();
    const model = options.model ?? this.defaultModel;
    let fullText = '';
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      const response = await axios.post(
        `${BASE_URL}/${model}:streamGenerateContent?alt=sse&key=${env.geminiApiKey}`,
        {
          contents: toGeminiContents(options.messages),
          systemInstruction: systemInstruction(options.messages),
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens ?? 4096,
          },
        },
        { timeout: env.requestTimeoutMs, responseType: 'stream' }
      );

      await new Promise<void>((resolve, reject) => {
        response.data.on('data', (buf: Buffer) => {
          for (const line of buf.toString().split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const evt = JSON.parse(payload);
              const delta = evt.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
              if (delta) {
                fullText += delta;
                onChunk({ provider: this.name, model, delta, done: false });
              }
              if (evt.usageMetadata) {
                usage.promptTokens = evt.usageMetadata.promptTokenCount ?? usage.promptTokens;
                usage.completionTokens = evt.usageMetadata.candidatesTokenCount ?? usage.completionTokens;
                usage.totalTokens = evt.usageMetadata.totalTokenCount ?? usage.totalTokens;
              }
            } catch {
              // ignore partial keep-alive lines
            }
          }
        });
        response.data.on('end', () => resolve());
        response.data.on('error', reject);
      });

      onChunk({ provider: this.name, model, delta: '', done: true, usage });

      return {
        provider: this.name,
        model,
        content: fullText,
        usage,
        latencyMs: Date.now() - start,
        estimatedCostUsd: estimateCost(usage.totalTokens, PRICING_PER_1K_TOKENS.gemini),
      };
    } catch (err) {
      throw classifyError(this.name, err);
    }
  }
}
