import axios from 'axios';
import {
  ChatMessage,
  ModelAvailabilityResult,
  ProviderAdapter,
  ProviderAdapterOptions,
  ProviderName,
  ProviderResponse,
  StreamChunk,
} from '../types';
import { env } from '../config/env';
import { PRICING_PER_1K_TOKENS } from '../config/routing';
import { classifyError, createSseFrameParser, estimateCost } from './base.adapter';

const DEFAULT_MAX_TOKENS = 1024;

function stripThinkTags(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
}

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
 * Shared OpenAI-compatible transport used by OpenAI, Groq, Together AI,
 * OpenRouter, Gemini and other compatible providers.
 */
export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly name: ProviderName;
  readonly defaultModel: string;
  readonly supportsVision: boolean;
  readonly maxOutputTokens: number;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly extraHeaders: Record<string, string>;
  private readonly extraBodyParams: Record<string, unknown>;
  private readonly requestTimeoutMs?: number;
  private readonly sendTemperature: boolean;
  private readonly freeModels: Set<string>;

  constructor(config: {
    name: ProviderName;
    baseUrl: string;
    apiKey: string;
    defaultModel: string;
    extraHeaders?: Record<string, string>;
    supportsVision?: boolean;
    maxOutputTokens?: number;
    extraBodyParams?: Record<string, unknown>;
    requestTimeoutMs?: number;
    sendTemperature?: boolean;
    freeModels?: string[];
  }) {
    this.name = config.name;
    this.defaultModel = config.defaultModel;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.extraHeaders = config.extraHeaders ?? {};
    this.supportsVision = config.supportsVision ?? false;
    this.maxOutputTokens = config.maxOutputTokens ?? 8192;
    this.extraBodyParams = config.extraBodyParams ?? {};
    this.requestTimeoutMs = config.requestTimeoutMs;
    this.sendTemperature = config.sendTemperature ?? true;
    this.freeModels = new Set(config.freeModels ?? []);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private effectiveTimeoutMs(): number {
    return this.requestTimeoutMs ?? env.requestTimeoutMs;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...this.extraHeaders,
    };
  }

  private requestBody(options: ProviderAdapterOptions) {
    return {
      model: options.model ?? this.defaultModel,
      messages: toOpenAIMessages(options.messages),
      ...(this.sendTemperature ? { temperature: options.temperature ?? 0.7 } : {}),
      max_tokens: Math.min(options.maxTokens ?? DEFAULT_MAX_TOKENS, this.maxOutputTokens),
      ...this.extraBodyParams,
    };
  }

  private estimatedCostUsd(model: string, totalTokens: number): number {
    if (this.freeModels.has(model) || model.endsWith(':free')) return 0;
    return estimateCost(totalTokens, PRICING_PER_1K_TOKENS[this.name]);
  }

  async chat(options: ProviderAdapterOptions): Promise<ProviderResponse> {
    const start = Date.now();
    const model = options.model ?? this.defaultModel;

    try {
      const { data } = await axios.post(
        `${this.baseUrl}/chat/completions`,
        this.requestBody(options),
        { headers: this.headers(), timeout: this.effectiveTimeoutMs() }
      );

      const content = stripThinkTags(data.choices?.[0]?.message?.content ?? '');
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
        estimatedCostUsd: this.estimatedCostUsd(data.model ?? model, usage.totalTokens),
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
          ...this.requestBody(options),
          stream: true,
          // Ask compatible providers for usage in the terminal SSE event
          // where supported. The parser still falls back to computed totals.
          stream_options: { include_usage: true },
        },
        { headers: this.headers(), timeout: this.effectiveTimeoutMs(), responseType: 'stream' }
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
        content: stripThinkTags(fullText),
        usage,
        latencyMs: Date.now() - start,
        estimatedCostUsd: this.estimatedCostUsd(model, usage.totalTokens),
      };
    } catch (err) {
      throw classifyError(this.name, err);
    }
  }

  async checkModelAvailability(): Promise<ModelAvailabilityResult> {
    if (!this.isConfigured()) {
      return { status: 'undetermined', model: this.defaultModel, detail: 'not configured' };
    }

    // OpenRouter's free router is a virtual model. It is intentionally absent
    // from some provider catalog responses, so validating it by literal ID
    // would incorrectly mark a healthy adapter as unavailable and trigger
    // failover. A configured OpenRouter key is enough for catalog validation;
    // real request failures still flow through normal error classification.
    if (this.defaultModel === 'openrouter/free') {
      return {
        status: 'available',
        model: this.defaultModel,
        detail: 'dynamic OpenRouter free router; availability is validated on inference',
      };
    }

    try {
      const { data } = await axios.get(`${this.baseUrl}/models`, {
        headers: this.headers(),
        timeout: env.requestTimeoutMs,
      });
      const ids: unknown = data?.data ?? data?.models ?? data;
      if (!Array.isArray(ids)) {
        return { status: 'undetermined', model: this.defaultModel, detail: 'unexpected /models response shape' };
      }
      const modelIds = ids.map((m: unknown) =>
        typeof m === 'string' ? m : (m as { id?: string })?.id
      );
      const found = modelIds.includes(this.defaultModel);
      return {
        status: found ? 'available' : 'unavailable',
        model: this.defaultModel,
        detail: found ? undefined : `not present in ${modelIds.length} models returned by ${this.baseUrl}/models`,
      };
    } catch (err) {
      const detail = axios.isAxiosError(err)
        ? `${err.response?.status ?? 'network error'}: ${err.message}`
        : String(err);
      return { status: 'undetermined', model: this.defaultModel, detail };
    }
  }
}
