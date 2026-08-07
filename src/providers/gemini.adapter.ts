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
  // gemini-2.0-flash was deprecated and shut down March 2026. Originally
  // defaulted to 2.5 Flash-Lite; switched again to 3.1 Flash-Lite
  // (2026-08-07) after repeated free-tier rate-limit hits within only a
  // few chat turns. 3.1 Flash-Lite is GA/no-billing-required on the free
  // tier and reports roughly double the RPM headroom of 2.5 Flash-Lite.
  // Deliberately NOT jumping to the newer 3.5 Flash-Lite / 3.6 Flash
  // generation yet: Google's own migration docs say those deprecate
  // temperature/top_p/top_k and push toward a new /interactions endpoint,
  // which this adapter's generateContent + generationConfig shape doesn't
  // speak — that upgrade needs its own adapter rewrite, not a one-line
  // model swap. If free-tier rate limits are still an issue after this
  // change, the router already fails over to the next configured provider
  // (visible as the "failover" chain in responses) rather than erroring
  // out, so a single provider's limit isn't a hard outage.
  readonly defaultModel = 'gemini-3.1-flash-lite';
  readonly supportsVision = true;
  // Verified against Google's docs for the 2.5/3.x Flash generations,
  // which have consistently supported up to 65,536 output tokens; not
  // independently re-verified for 3.1 Flash-Lite specifically at time of
  // this switch — if requests start truncating, check Google's current
  // docs for this exact model ID first.
  readonly maxOutputTokens = 65536;

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
            maxOutputTokens: Math.min(options.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
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
            maxOutputTokens: Math.min(options.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
          },
        },
        { timeout: env.requestTimeoutMs, responseType: 'stream' }
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
}
