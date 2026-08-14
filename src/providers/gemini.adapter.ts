import axios from 'axios';
import {
  ChatMessage,
  ModelAvailabilityResult,
  ProviderAdapter,
  ProviderAdapterOptions,
  ProviderResponse,
  StreamChunk,
} from '../types';
import { env } from '../config/env';
import { PRICING_PER_1K_TOKENS } from '../config/routing';
import { classifyError, createSseFrameParser, estimateCost } from './base.adapter';

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
  // Free-tier default: Gemini 2.5 Flash-Lite is explicitly listed by Google
  // with free-of-charge input/output pricing. Keep the request shape on the
  // stable generateContent API used by this adapter.
  readonly defaultModel = 'gemini-2.5-flash-lite';
  readonly supportsVision = true;
  readonly maxOutputTokens = 65536;

  isConfigured(): boolean {
    return Boolean(env.geminiApiKey);
  }

  private headers() {
    return {
      'x-goog-api-key': env.geminiApiKey,
      'Content-Type': 'application/json',
    };
  }

  async chat(options: ProviderAdapterOptions): Promise<ProviderResponse> {
    const start = Date.now();
    const model = options.model ?? this.defaultModel;

    try {
      const { data } = await axios.post(
        `${BASE_URL}/${model}:generateContent`,
        {
          contents: toGeminiContents(options.messages),
          systemInstruction: systemInstruction(options.messages),
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: Math.min(options.maxTokens ?? 1024, this.maxOutputTokens),
          },
        },
        { headers: this.headers(), timeout: env.requestTimeoutMs }
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
        `${BASE_URL}/${model}:streamGenerateContent?alt=sse`,
        {
          contents: toGeminiContents(options.messages),
          systemInstruction: systemInstruction(options.messages),
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: Math.min(options.maxTokens ?? 1024, this.maxOutputTokens),
          },
        },
        { headers: this.headers(), timeout: env.requestTimeoutMs, responseType: 'stream' }
      );

      await new Promise<void>((resolve, reject) => {
        const parseFrame = createSseFrameParser((payload) => {
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
            // Ignore malformed keep-alive frames without dropping buffered data.
          }
        });
        response.data.on('data', parseFrame);
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

  async checkModelAvailability(): Promise<ModelAvailabilityResult> {
    if (!this.isConfigured()) {
      return { status: 'undetermined', model: this.defaultModel, detail: 'not configured' };
    }

    try {
      const { data } = await axios.get(BASE_URL, {
        headers: this.headers(),
        timeout: env.requestTimeoutMs,
      });
      const models: unknown = data?.models;
      if (!Array.isArray(models)) {
        return { status: 'undetermined', model: this.defaultModel, detail: 'unexpected models-list response shape' };
      }

      const modelNames = models
        .map((model: unknown) => (model as { name?: string })?.name)
        .filter((name): name is string => typeof name === 'string')
        .map((name) => name.replace(/^models\//, ''));

      const found = modelNames.includes(this.defaultModel);
      return {
        status: found ? 'available' : 'unavailable',
        model: this.defaultModel,
        detail: found ? undefined : `not present in ${modelNames.length} models returned by Gemini`,
      };
    } catch (err) {
      const detail = axios.isAxiosError(err)
        ? `${err.response?.status ?? 'network error'}: ${err.message}`
        : String(err);
      return { status: 'undetermined', model: this.defaultModel, detail };
    }
  }
}
