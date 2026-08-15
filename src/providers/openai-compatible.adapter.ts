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

// Providers like Groq count the *requested* max_tokens against your TPM
// budget upfront, before a single token is generated — not just what's
// actually produced. Previously, when a caller didn't specify maxTokens,
// this adapter defaulted to reserving the entire maxOutputTokens ceiling
// (e.g. 16,384) on every request, so even "hi" could blow a low TPM cap.
// This is a much saner "normal chat reply" default budget; callers that
// actually need long-form output still get up to the real ceiling by
// passing maxTokens explicitly.
const DEFAULT_MAX_TOKENS = 1024;

// Defensive safety net for reasoning models (e.g. Groq's qwen3.6-27b) that
// leak internal chain-of-thought into the visible content wrapped in
// <think>...</think> tags. We already ask providers to suppress this via
// extraBodyParams (e.g. reasoning_format: 'hidden'), but that setting has
// been reported unreliable in the wild — this is a no-op for any response
// that never contained the tags in the first place.
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
 * OpenAI, Groq, Together AI, OpenRouter, and Google Gemini all expose an
 * OpenAI-compatible `/chat/completions` endpoint. Rather than duplicating
 * near-identical adapters, this base class parameterizes over base URL, API
 * key, default model, and any extra headers/body fields.
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
  // Gemini 3 Flash/Flash-Lite reject the legacy sampling fields. Keep this
  // opt-out per adapter so the shared OpenAI-compatible surface remains
  // backward-compatible for providers that still accept temperature.
  private readonly sendTemperature: boolean;

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
          ...this.requestBody(options),
          stream: true,
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
        estimatedCostUsd: estimateCost(usage.totalTokens, PRICING_PER_1K_TOKENS[this.name]),
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
