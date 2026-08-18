import axios from 'axios';
import {
  ChatMessage,
  ModelAvailabilityResult,
  ProviderAdapter,
  ProviderAdapterOptions,
  ProviderError,
  ProviderResponse,
  StreamChunk,
} from '../types';
import { env } from '../config/env';
import { PRICING_PER_1K_TOKENS } from '../config/routing';
import { classifyError, createSseFrameParser, estimateCost } from './base.adapter';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODELS_API_URL = 'https://api.anthropic.com/v1/models';

function splitSystem(messages: ChatMessage[]): { system?: string; rest: ChatMessage[] } {
  const systemMsgs = messages.filter((m) => m.role === 'system').map((m) => m.content);
  const rest = messages.filter((m) => m.role !== 'system');
  return { system: systemMsgs.length ? systemMsgs.join('\n') : undefined, rest };
}

// Anthropic's Messages API wants image blocks and text blocks as separate
// entries in a content array — a different shape from OpenAI's image_url
// parts. Messages without images stay a plain string for compatibility.
function toAnthropicMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (!m.images || m.images.length === 0) {
      return { role: m.role, content: m.content };
    }
    return {
      role: m.role,
      content: [
        ...m.images.map((img) => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
        })),
        { type: 'text', text: m.content },
      ],
    };
  });
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly name = 'anthropic' as const;
  // claude-haiku-4-5 is Anthropic's current cheapest, fastest model — a
  // better fit for a cost-conscious gateway default than a full Sonnet.
  // The router can still be pointed at Sonnet 5 for coding/reasoning tasks
  // via the `model` field on a request.
  readonly defaultModel = 'claude-haiku-4-5-20251001';
  readonly supportsVision = true;
  // Verified against Anthropic's docs: Haiku 4.5 supports exactly 64,000
  // max output tokens.
  readonly maxOutputTokens = 64000;

  isConfigured(): boolean {
    return Boolean(env.anthropicApiKey);
  }

  private headers() {
    return {
      'x-api-key': env.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
  }

  async chat(options: ProviderAdapterOptions): Promise<ProviderResponse> {
    const start = Date.now();
    const { system, rest } = splitSystem(options.messages);

    try {
      const { data } = await axios.post(
        API_URL,
        {
          model: options.model ?? this.defaultModel,
          system,
          messages: toAnthropicMessages(rest),
          max_tokens: Math.min(options.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
          temperature: options.temperature ?? 0.7,
        },
        { headers: this.headers(), timeout: env.requestTimeoutMs }
      );

      const content = (data.content ?? []).map((b: { text?: string }) => b.text ?? '').join('');
      const usage = {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      };

      return {
        provider: this.name,
        model: data.model ?? this.defaultModel,
        content,
        usage,
        latencyMs: Date.now() - start,
        estimatedCostUsd: estimateCost(usage.totalTokens, PRICING_PER_1K_TOKENS.anthropic),
        finishReason: data.stop_reason,
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
    const { system, rest } = splitSystem(options.messages);
    const model = options.model ?? this.defaultModel;
    let fullText = '';
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      const response = await axios.post(
        API_URL,
        {
          model,
          system,
          messages: toAnthropicMessages(rest),
          max_tokens: Math.min(options.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
          temperature: options.temperature ?? 0.7,
          stream: true,
        },
        { headers: this.headers(), timeout: env.requestTimeoutMs, responseType: 'stream' }
      );

      await new Promise<void>((resolve, reject) => {
        const parseFrame = createSseFrameParser((payload) => {
          try {
            const evt = JSON.parse(payload);
            if (evt.type === 'content_block_delta') {
              const delta = evt.delta?.text ?? '';
              fullText += delta;
              onChunk({ provider: this.name, model, delta, done: false });
            }
            if (evt.type === 'message_delta' && evt.usage) {
              usage.completionTokens = evt.usage.output_tokens ?? usage.completionTokens;
            }
            if (evt.type === 'message_start' && evt.message?.usage) {
              usage.promptTokens = evt.message.usage.input_tokens ?? 0;
            }
          } catch {
            // Ignore malformed keep-alive frames without dropping buffered data.
          }
        });
        response.data.on('data', parseFrame);
        response.data.on('end', () => resolve());
        response.data.on('error', reject);
      });

      usage.totalTokens = usage.promptTokens + usage.completionTokens;
      onChunk({ provider: this.name, model, delta: '', done: true, usage });

      return {
        provider: this.name,
        model,
        content: fullText,
        usage,
        latencyMs: Date.now() - start,
        estimatedCostUsd: estimateCost(usage.totalTokens, PRICING_PER_1K_TOKENS.anthropic),
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
      const { data } = await axios.get(MODELS_API_URL, {
        headers: this.headers(),
        timeout: env.requestTimeoutMs,
      });
      const models: unknown = data?.data;
      if (!Array.isArray(models)) {
        return { status: 'undetermined', model: this.defaultModel, detail: 'unexpected models-list response shape' };
      }

      const modelIds = models
        .map((model: unknown) => (model as { id?: string })?.id)
        .filter((id): id is string => typeof id === 'string');

      const found = modelIds.includes(this.defaultModel);
      return {
        status: found ? 'available' : 'unavailable',
        model: this.defaultModel,
        detail: found ? undefined : `not present in ${modelIds.length} models returned by Anthropic`,
      };
    } catch (err) {
      const detail = axios.isAxiosError(err)
        ? `${err.response?.status ?? 'network error'}: ${err.message}`
        : String(err);
      return { status: 'undetermined', model: this.defaultModel, detail };
    }
  }

  // See openai-compatible.adapter.ts probeHealth() for the rationale —
  // same GET /models call as checkModelAvailability() above, routed
  // through classifyError() instead of swallowing failures, so
  // health-check.service gets a precise ProviderErrorCode.
  async probeHealth(): Promise<void> {
    if (!this.isConfigured()) {
      throw new ProviderError(this.name, 'AUTH_ERROR', `${this.name}: not configured`);
    }

    try {
      const { data } = await axios.get(MODELS_API_URL, {
        headers: this.headers(),
        timeout: env.requestTimeoutMs,
      });
      const models: unknown = data?.data;
      if (!Array.isArray(models)) return;

      const modelIds = models
        .map((model: unknown) => (model as { id?: string })?.id)
        .filter((id): id is string => typeof id === 'string');

      if (!modelIds.includes(this.defaultModel)) {
        throw new ProviderError(
          this.name,
          'NOT_FOUND',
          `${this.name}: default model "${this.defaultModel}" not present in live models list (${modelIds.length} returned)`
        );
      }
    } catch (err) {
      throw classifyError(this.name, err);
    }
  }
}
