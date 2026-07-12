import axios from 'axios';
import {
  ChatMessage,
  ProviderAdapter,
  ProviderAdapterOptions,
  ProviderName,
  ProviderResponse,
  StreamChunk,
} from '../types';
import { env } from '../config/env';
import { PRICING_PER_1K_TOKENS } from '../config/routing';
import { classifyError, createSseFrameParser, estimateCost } from './base.adapter';

// Converts our internal ChatMessage (which carries an optional `images`
// array) into the OpenAI chat-completions wire format. Messages with no
// images stay a plain string for maximum compatibility with providers that
// are stricter about content shape; only image-bearing messages become a
// content-parts array, per OpenAI's multimodal message spec.
function toOpenAIMessages(messages: ChatMessage[]): Array<{ role: string; content: unknown }> {
  return messages.map((m) => {
    if (!m.images || m.images.length === 0) {
      return { role: m.role, content: m.content };
    }
    return {
      role: m.role,
      content: [
        ...m.images.map((img) => ({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
        })),
        { type: 'text', text: m.content },
      ],
    };
  });
}

/**
 * OpenAI, Groq, Together AI, and OpenRouter all expose an OpenAI-compatible
 * `/chat/completions` endpoint. Rather than duplicating four near-identical
 * adapters, this base class parameterizes over base URL, API key, default
 * model, and any extra headers (e.g. OpenRouter's attribution headers).
 */
export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly name: ProviderName;
  readonly defaultModel: string;
  readonly supportsVision: boolean;
  readonly maxOutputTokens: number;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly extraHeaders: Record<string, string>;

  constructor(config: {
    name: ProviderName;
    baseUrl: string;
    apiKey: string;
    defaultModel: string;
    extraHeaders?: Record<string, string>;
    supportsVision?: boolean;
    maxOutputTokens?: number;
  }) {
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.extraHeaders = config.extraHeaders ?? {};
    // Defaults to false: most of this gateway's OpenAI-compatible providers
    // (Groq, Together, DeepSeek, Cerebras, Mistral) run text-only default
    // models here. Only OpenAI's own default model is vision-capable.
    this.supportsVision = config.supportsVision ?? false;
    // Conservative default for subclasses that don't specify a verified
    // real ceiling — better to under-ask than to send an invalid
    // over-limit value that hard-fails instead of failing over cleanly.
    this.maxOutputTokens = config.maxOutputTokens ?? 8192;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...this.extraHeaders,
    };
  }

  async chat(options: ProviderAdapterOptions): Promise<ProviderResponse> {
    const start = Date.now();
    const model = options.model ?? this.defaultModel;

    try {
      const { data } = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model,
          messages: toOpenAIMessages(options.messages),
          temperature: options.temperature ?? 0.7,
          max_tokens: Math.min(options.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
        },
        { headers: this.headers(), timeout: env.requestTimeoutMs }
      );

      const content = data.choices?.[0]?.message?.content ?? '';
      const usage = {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      };

      return {
        provider: this.name,
        model: data.model ?? model,
        content,
        usage,
        latencyMs: Date.now() - start,
        estimatedCostUsd: estimateCost(usage.totalTokens, PRICING_PER_1K_TOKENS[this.name]),
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
    const start = Date.now();
    const model = options.model ?? this.defaultModel;
    let fullText = '';
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model,
          messages: toOpenAIMessages(options.messages),
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
            if (evt.usage) {
              usage.promptTokens = evt.usage.prompt_tokens ?? usage.promptTokens;
              usage.completionTokens = evt.usage.completion_tokens ?? usage.completionTokens;
              usage.totalTokens = evt.usage.total_tokens ?? usage.totalTokens;
            }
          } catch {
            // Ignore malformed keep-alive frames without dropping buffered data.
          }
        });
        response.data.on('data', parseFrame);
        response.data.on('end', () => resolve());
        response.data.on('error', reject);
      });

      if (!usage.totalTokens) usage.totalTokens = usage.promptTokens + usage.completionTokens;
      onChunk({ provider: this.name, model, delta: '', done: true, usage });

      return {
        provider: this.name,
        model,
        content: fullText,
        usage,
        latencyMs: Date.now() - start,
        estimatedCostUsd: estimateCost(usage.totalTokens, PRICING_PER_1K_TOKENS[this.name]),
      };
    } catch (err) {
      throw classifyError(this.name, err);
    }
  }
}
