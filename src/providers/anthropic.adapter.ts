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
import { classifyError, estimateCost } from './base.adapter';

const API_URL = 'https://api.anthropic.com/v1/messages';

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
          max_tokens: options.maxTokens ?? 4096,
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
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.7,
          stream: true,
        },
        { headers: this.headers(), timeout: env.requestTimeoutMs, responseType: 'stream' }
      );

      await new Promise<void>((resolve, reject) => {
        response.data.on('data', (buf: Buffer) => {
          for (const line of buf.toString().split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
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
              // ignore partial/non-JSON keep-alive lines
            }
          }
        });
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
}
