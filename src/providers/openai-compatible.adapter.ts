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
  // Provider-specific request body fields that aren't part of the common
  // OpenAI-compatible surface (e.g. Groq's reasoning_format). Kept
  // per-adapter rather than in the shared base logic since other
  // OpenAI-compatible providers may reject unrecognized fields.
  private readonly extraBodyParams: Record<string, unknown>;

  constructor(config: {
    name: ProviderName;
    baseUrl: string;
    apiKey: string;
    defaultModel: string;
    extraHeaders?: Record<string, string>;
    supportsVision?: boolean;
    maxOutputTokens?: number;
    extraBodyParams?: Record<string, unknown>;
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
    this.extraBodyParams = config.extraBodyParams ?? {};
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
          max_tokens: Math.min(options.maxTokens ?? DEFAULT_MAX_TOKENS, this.maxOutputTokens),
          ...this.extraBodyParams,
        },
        { headers: this.headers(), timeout: env.requestTimeoutMs }
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
          model,
          messages: toOpenAIMessages(options.messages),
          temperature: options.temperature ?? 0.7,
          max_tokens: Math.min(options.maxTokens ?? DEFAULT_MAX_TOKENS, this.maxOutputTokens),
          stream: true,
          ...this.extraBodyParams,
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
        content: stripThinkTags(fullText),
        usage,
        latencyMs: Date.now() - start,
        estimatedCostUsd: estimateCost(usage.totalTokens, PRICING_PER_1K_TOKENS[this.name]),
      };
    } catch (err) {
      throw classifyError(this.name, err);
    }
  }

  // Nearly every OpenAI-compatible provider exposes GET /v1/models listing
  // every model id currently served. We use that as a lightweight canary:
  // if our configured defaultModel isn't in the list, it's most likely been
  // deprecated/renamed provider-side (this is exactly what happened when
  // Groq pulled llama-4-scout-17b-16e-instruct without the gateway
  // noticing until a live request 404'd in production).
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
      // A failed check (auth error, no /models endpoint, timeout, etc.) is
      // NOT evidence the model is gone — only report undetermined so we
      // never cry wolf about a deprecation that isn't real.
      return { status: 'undetermined', model: this.defaultModel, detail };
    }
  }
}
