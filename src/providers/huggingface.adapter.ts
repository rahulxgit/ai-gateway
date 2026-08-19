import axios from 'axios';
import {
  ChatMessage,
  ProviderAdapter,
  ProviderAdapterOptions,
  ProviderError,
  ProviderResponse,
  StreamChunk,
} from '../types';
import { env } from '../config/env';
import { PRICING_PER_1K_TOKENS } from '../config/routing';
import { classifyError, createSseFrameParser, estimateCost } from './base.adapter';

// Hugging Face's router exposes an OpenAI-compatible chat completions
// endpoint for supported chat models, which keeps this adapter simple while
// still being distinct enough (model naming, no native streaming usage
// metadata) to warrant its own class rather than reusing the OpenAI base.
const API_URL = 'https://router.huggingface.co/v1/chat/completions';

function estimateTokens(messages: ChatMessage[] | string): number {
  const text = Array.isArray(messages) ? messages.map((m) => m.content).join(' ') : messages;
  return Math.ceil(text.length / 4);
}

export class HuggingFaceAdapter implements ProviderAdapter {
  readonly name = 'huggingface' as const;
  readonly defaultModel = 'meta-llama/Llama-3.3-70B-Instruct';
  // The default model here is text-only; HF's router doesn't reliably
  // expose a vision-capable chat model in this slot.
  readonly supportsVision = false;
  // HF's router dynamically proxies each request to whichever backend
  // provider (Cerebras, Together, Fireworks, etc.) is currently serving
  // this model — there's no single fixed ceiling to verify against, since
  // it depends on which provider actually handles a given request. Kept
  // conservative rather than guessing.
  readonly maxOutputTokens = 8192;
  // HF grants every account a small monthly pool of free router credits
  // regardless of which supported chat model is requested, so the default
  // model is usable free-of-charge up to that monthly cap.
  readonly freeModels = ['meta-llama/Llama-3.3-70B-Instruct'];

  isConfigured(): boolean {
    return Boolean(env.hfApiKey);
  }

  private headers() {
    return {
      Authorization: `Bearer ${env.hfApiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async chat(options: ProviderAdapterOptions): Promise<ProviderResponse> {
    const start = Date.now();
    const model = options.model ?? this.defaultModel;

    try {
      const { data } = await axios.post(
        API_URL,
        {
          model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: Math.min(options.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
        },
        { headers: this.headers(), timeout: env.requestTimeoutMs }
      );

      const content = data.choices?.[0]?.message?.content ?? '';
      const usage = {
        promptTokens: data.usage?.prompt_tokens ?? estimateTokens(options.messages),
        completionTokens: data.usage?.completion_tokens ?? estimateTokens(content),
        totalTokens:
          data.usage?.total_tokens ??
          estimateTokens(options.messages) + estimateTokens(content),
      };

      return {
        provider: this.name,
        model,
        content,
        usage,
        latencyMs: Date.now() - start,
        estimatedCostUsd: estimateCost(usage.totalTokens, PRICING_PER_1K_TOKENS.huggingface),
        finishReason: data.choices?.[0]?.finish_reason,
      };
    } catch (err) {
      throw classifyError(this.name, err);
    }
  }

  async chatStream(
    options: ProviderAdapterOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ProviderResponse> {
    // Hugging Face's router supports SSE streaming with the same
    // OpenAI-style `data: {...}` chunk format, so we reuse that parsing
    // logic here rather than pulling in the full compatible-adapter class.
    const start = Date.now();
    const model = options.model ?? this.defaultModel;
    let fullText = '';

    try {
      const response = await axios.post(
        API_URL,
        {
          model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: Math.min(options.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
          stream: true,
        },
        { headers: this.headers(), timeout: env.requestTimeoutMs, responseType: 'stream' }
      );

      await new Promise<void>((resolve, reject) => {
        const parseFrame = createSseFrameParser((payload) => {
          if (payload === '[DONE]') return;
          try {
            const evt = JSON.parse(payload);
            const delta = evt.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              fullText += delta;
              onChunk({ provider: this.name, model, delta, done: false });
            }
          } catch {
            // Ignore malformed keep-alive frames without dropping buffered data.
          }
        });
        response.data.on('data', parseFrame);
        response.data.on('end', () => resolve());
        response.data.on('error', reject);
      });

      const usage = {
        promptTokens: estimateTokens(options.messages),
        completionTokens: estimateTokens(fullText),
        totalTokens: estimateTokens(options.messages) + estimateTokens(fullText),
      };
      onChunk({ provider: this.name, model, delta: '', done: true, usage });

      return {
        provider: this.name,
        model,
        content: fullText,
        usage,
        latencyMs: Date.now() - start,
        estimatedCostUsd: estimateCost(usage.totalTokens, PRICING_PER_1K_TOKENS.huggingface),
      };
    } catch (err) {
      throw classifyError(this.name, err);
    }
  }

  // Cheap liveness probe for the background health-check service. HF's
  // router has no /models listing behind this auth scheme, so we confirm
  // the token itself is valid via the account endpoint instead — never a
  // real completion request, no token spend.
  async probeHealth(): Promise<void> {
    if (!this.isConfigured()) {
      throw new ProviderError(this.name, 'AUTH_ERROR', `${this.name}: not configured`);
    }
    try {
      await axios.get('https://huggingface.co/api/whoami-v2', {
        headers: this.headers(),
        timeout: env.requestTimeoutMs,
      });
    } catch (err) {
      throw classifyError(this.name, err);
    }
  }
}
