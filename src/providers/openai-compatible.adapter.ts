import axios from 'axios';
import {
  ChatMessage,
  ModelAvailabilityResult,
  ProviderAdapter,
  ProviderAdapterOptions,
  ProviderError,
  ProviderName,
  ProviderResponse,
  StreamChunk,
} from '../types';
import { env } from '../config/env';
import { isFreeModel, PRICING_PER_1K_TOKENS } from '../config/routing';
import { classifyError, createSseFrameParser, estimateCost } from './base.adapter';

const DEFAULT_MAX_TOKENS = 1024;

function stripThinkTags(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
}

function toOpenAIMessages(messages: ChatMessage[]): Array<{ role: string; content: unknown }> {
  return messages.map((m) => {
    if (!m.images || m.images.length === 0) return { role: m.role, content: m.content };
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

/** Shared OpenAI-compatible transport used by multiple provider adapters. */
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
  private readonly freeModelsSet: Set<string>;
  readonly freeModels: string[];

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
    this.freeModelsSet = new Set(config.freeModels ?? []);
    this.freeModels = [...this.freeModelsSet];
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

  private isConfiguredFreeModel(model: string): boolean {
    return this.freeModelsSet.has(model) || isFreeModel(this.name, model);
  }

  private estimatedCostUsd(model: string, totalTokens: number, requestedModel = model): number {
    if (this.isConfiguredFreeModel(model) || this.isConfiguredFreeModel(requestedModel)) return 0;
    return estimateCost(totalTokens, PRICING_PER_1K_TOKENS[this.name]);
  }

  private axiosRequestConfig(options: ProviderAdapterOptions, extra: Record<string, unknown> = {}) {
    return {
      headers: this.headers(),
      timeout: this.effectiveTimeoutMs(),
      ...(options.signal ? { signal: options.signal } : {}),
      ...extra,
    };
  }

  async chat(options: ProviderAdapterOptions): Promise<ProviderResponse> {
    const start = Date.now();
    const requestedModel = options.model ?? this.defaultModel;

    try {
      const { data } = await axios.post(
        `${this.baseUrl}/chat/completions`,
        this.requestBody(options),
        this.axiosRequestConfig(options)
      );

      const responseModel = data.model ?? requestedModel;
      const content = stripThinkTags(data.choices?.[0]?.message?.content ?? '');
      const usage = {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      };

      return {
        provider: this.name,
        model: responseModel,
        content,
        usage,
        latencyMs: Date.now() - start,
        estimatedCostUsd: this.estimatedCostUsd(responseModel, usage.totalTokens, requestedModel),
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
    const requestedModel = options.model ?? this.defaultModel;
    let responseModel = requestedModel;
    let fullText = '';
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        { ...this.requestBody(options), stream: true },
        this.axiosRequestConfig(options, { responseType: 'stream' })
      );

      await new Promise<void>((resolve, reject) => {
        const parseFrame = createSseFrameParser((payload) => {
          if (payload === '[DONE]') return;
          try {
            const evt = JSON.parse(payload);
            if (evt.model) responseModel = evt.model;
            const delta = evt.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              fullText += delta;
              onChunk({ provider: this.name, model: responseModel, delta, done: false });
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
      onChunk({ provider: this.name, model: responseModel, delta: '', done: true, usage });

      return {
        provider: this.name,
        model: responseModel,
        content: stripThinkTags(fullText),
        usage,
        latencyMs: Date.now() - start,
        estimatedCostUsd: this.estimatedCostUsd(responseModel, usage.totalTokens, requestedModel),
      };
    } catch (err) {
      throw classifyError(this.name, err);
    }
  }

  async checkModelAvailability(): Promise<ModelAvailabilityResult> {
    if (!this.isConfigured()) {
      return { status: 'undetermined', model: this.defaultModel, detail: 'not configured' };
    }

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

  // Active liveness probe for health-check.service. Deliberately the exact
  // same GET /models call as checkModelAvailability() above — no separate
  // network path to maintain — but routed through classifyError() instead
  // of swallowing every failure into a single generic 'unavailable', so
  // the health-check service gets a precise ProviderErrorCode (auth vs.
  // billing vs. rate limit vs. genuinely gone) instead of an undifferentiated
  // "something's wrong". Costs one GET request, never a completion — no
  // token spend regardless of how often this runs.
  async probeHealth(): Promise<void> {
    if (!this.isConfigured()) {
      throw new ProviderError(this.name, 'AUTH_ERROR', `${this.name}: not configured`);
    }

    if (this.defaultModel === 'openrouter/free') {
      // Dynamic router with no single fixed model to check for presence —
      // its own individual free-model routes are validated on inference,
      // per checkModelAvailability() above. A reachable /models endpoint
      // with a working key is the whole health signal here.
    }

    try {
      const { data } = await axios.get(`${this.baseUrl}/models`, {
        headers: this.headers(),
        timeout: env.requestTimeoutMs,
      });
      if (this.defaultModel === 'openrouter/free') return;

      const ids: unknown = data?.data ?? data?.models ?? data;
      if (!Array.isArray(ids)) return; // Unexpected shape isn't itself a failure signal — stay silent rather than false-positive.

      const modelIds = ids.map((m: unknown) => (typeof m === 'string' ? m : (m as { id?: string })?.id));
      if (!modelIds.includes(this.defaultModel)) {
        throw new ProviderError(
          this.name,
          'NOT_FOUND',
          `${this.name}: default model "${this.defaultModel}" not present in live /models list (${modelIds.length} models returned)`
        );
      }
    } catch (err) {
      throw classifyError(this.name, err);
    }
  }
}
