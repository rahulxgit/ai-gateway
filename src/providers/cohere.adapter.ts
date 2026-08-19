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
import { classifyError, createSseFrameParser } from './base.adapter';

// Cohere's free "Trial" API key is a genuinely recurring free tier (not a
// one-time credit like several other providers in this gateway): 1,000
// API calls/month across all endpoints, capped at 20 requests/minute on
// Chat, no card required, resets monthly. Deliberately excluded from
// FREE_AUTO_PROVIDERS given how low the monthly ceiling is — the automatic
// router would exhaust it fast. Use via forceProvider.
//
// Cohere's Chat API (v2) is NOT OpenAI-compatible — different endpoint
// shape (`message.content[]` blocks instead of `choices[].message`,
// `usage.billed_units` instead of `usage.prompt_tokens`) — so this can't
// reuse OpenAICompatibleAdapter and implements ProviderAdapter directly,
// same pattern as the Anthropic adapter.
const API_URL = 'https://api.cohere.com/v2/chat';

function toCohereMessages(messages: ChatMessage[]) {
  // Cohere v2 uses the same role names (system/user/assistant) and a plain
  // string `content` field for text-only turns, so this is a direct
  // pass-through. Cohere's trial key does not support vision input, so
  // image attachments are intentionally dropped rather than sent.
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

export class CohereAdapter implements ProviderAdapter {
  readonly name = 'cohere' as const;
  // command-r7b is Cohere's smallest/cheapest current chat model — the
  // best default for a 1,000-calls/month trial key where every call
  // counts, versus defaulting to the larger command-a/command-r-plus.
  readonly defaultModel = 'command-r7b-12-2024';
  readonly supportsVision = false;
  // Not independently verified against Cohere's per-model ceiling — kept
  // conservative and consistent with this gateway's other unverified
  // defaults (see PROJECT_OVERVIEW.md pattern).
  readonly maxOutputTokens = 4096;
  // Every call on a trial key is free against the 1,000/month cap
  // regardless of which Cohere chat model is requested — see the file-level
  // comment above for the exact terms.
  readonly freeModels = ['command-r7b-12-2024'];

  isConfigured(): boolean {
    return Boolean(env.cohereApiKey);
  }

  private headers() {
    return {
      Authorization: `Bearer ${env.cohereApiKey}`,
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
          messages: toCohereMessages(options.messages),
          temperature: options.temperature ?? 0.7,
          max_tokens: Math.min(options.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
        },
        { headers: this.headers(), timeout: env.requestTimeoutMs }
      );

      const content = (data.message?.content ?? [])
        .filter((b: { type?: string }) => b.type === 'text')
        .map((b: { text?: string }) => b.text ?? '')
        .join('');

      const billed = data.usage?.billed_units ?? data.meta?.billed_units ?? {};
      const usage = {
        promptTokens: billed.input_tokens ?? 0,
        completionTokens: billed.output_tokens ?? 0,
        totalTokens: (billed.input_tokens ?? 0) + (billed.output_tokens ?? 0),
      };

      return {
        provider: this.name,
        model,
        content,
        usage,
        latencyMs: Date.now() - start,
        // Trial-key usage is free (counted against the 1,000/month cap,
        // not billed in USD), so cost is always reported as $0 here.
        estimatedCostUsd: 0,
        finishReason: data.finish_reason,
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
    let finishReason: string | undefined;
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      const response = await axios.post(
        API_URL,
        {
          model,
          messages: toCohereMessages(options.messages),
          temperature: options.temperature ?? 0.7,
          max_tokens: Math.min(options.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
          stream: true,
        },
        { headers: this.headers(), timeout: env.requestTimeoutMs, responseType: 'stream' }
      );

      await new Promise<void>((resolve, reject) => {
        const parseFrame = createSseFrameParser((payload) => {
          try {
            const evt = JSON.parse(payload);
            if (evt.type === 'content-delta') {
              const delta = evt.delta?.message?.content?.text ?? '';
              if (delta) {
                fullText += delta;
                onChunk({ provider: this.name, model, delta, done: false });
              }
            }
            if (evt.type === 'message-end') {
              finishReason = evt.delta?.finish_reason ?? finishReason;
              const billed = evt.delta?.usage?.billed_units ?? {};
              usage.promptTokens = billed.input_tokens ?? usage.promptTokens;
              usage.completionTokens = billed.output_tokens ?? usage.completionTokens;
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
        estimatedCostUsd: 0,
        finishReason,
      };
    } catch (err) {
      throw classifyError(this.name, err);
    }
  }

  // Cheap liveness probe for the background health-check service. Cohere
  // has no bare /models GET usable without a real chat call in v2, so this
  // hits the models listing endpoint that trial keys can read without
  // spending against the chat-call quota.
  async probeHealth(): Promise<void> {
    if (!this.isConfigured()) {
      throw new ProviderError(this.name, 'AUTH_ERROR', `${this.name}: not configured`);
    }
    try {
      await axios.get('https://api.cohere.com/v1/models', {
        headers: this.headers(),
        timeout: env.requestTimeoutMs,
      });
    } catch (err) {
      throw classifyError(this.name, err);
    }
  }
}
