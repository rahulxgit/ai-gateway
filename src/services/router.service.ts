import {
  ChatRequest,
  ProviderError,
  ProviderName,
  ProviderResponse,
  StreamChunk,
} from '../types';
import { buildProviderOrder } from '../config/routing';
import { getProvider, listConfiguredProviders } from '../providers/registry';
import { retryWithBackoff } from '../utils/retry';
import { env } from '../config/env';
import { logger, failoverLogger } from '../utils/logger';
import { recordSuccess, recordFailure, isLikelyHealthy } from './health.service';

export interface RouteResult {
  response: ProviderResponse;
  failoverChain: ProviderName[]; // providers attempted before success, in order
}

export class AllProvidersFailedError extends Error {
  public readonly attempts: { provider: ProviderName; error: string }[];
  constructor(attempts: { provider: ProviderName; error: string }[]) {
    super('All configured providers failed to fulfill the request');
    this.name = 'AllProvidersFailedError';
    this.attempts = attempts;
  }
}

function requestHasImages(request: ChatRequest): boolean {
  return request.messages.some((m) => m.images && m.images.length > 0);
}

function candidateOrder(request: ChatRequest): ProviderName[] {
  const configured = new Set(listConfiguredProviders());
  const order = buildProviderOrder(request.taskType, request.forceProvider).filter((p) =>
    configured.has(p)
  );

  // If any message carries an image, only providers whose default model
  // actually accepts image input are eligible — sending an image to a
  // text-only model would silently be dropped or rejected by that
  // provider's API, which is worse than failing over immediately. Checked
  // only against already-configured providers so we never call getProvider
  // on something that was never set up in the first place.
  const eligible = requestHasImages(request)
    ? order.filter((p) => getProvider(p).supportsVision)
    : order;

  // Prefer providers that look healthy right now, but never drop a provider
  // entirely just because it looked unhealthy a moment ago — keep it as a
  // last-resort candidate in case it has recovered.
  const healthy = eligible.filter((p) => isLikelyHealthy(p));
  const degraded = eligible.filter((p) => !isLikelyHealthy(p));
  return [...healthy, ...degraded];
}

/**
 * Runs a non-streaming chat request through the failover chain: tries each
 * configured provider in priority order, retrying transient errors with
 * backoff, and moving to the next provider on any retryable failure. Only
 * throws once every configured provider has been exhausted.
 */
export async function routeChat(request: ChatRequest): Promise<RouteResult> {
  const order = candidateOrder(request);
  if (order.length === 0) {
    throw new Error(
      requestHasImages(request)
        ? 'No vision-capable providers are configured. Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY to send images.'
        : 'No providers are configured. Set at least one *_API_KEY in .env'
    );
  }

  const attempted: ProviderName[] = [];
  const failures: { provider: ProviderName; error: string }[] = [];

  for (const providerName of order) {
    attempted.push(providerName);
    const adapter = getProvider(providerName);
    // A model override (e.g. an OpenRouter-specific model string like
    // "deepseek/deepseek-chat-v3.1:free") is only meaningful for the
    // provider it was intended for — passing it to a different provider
    // during failover would be an invalid/nonsensical model ID for that
    // provider's API and cause an immediate, avoidable failure. Only the
    // explicitly forced provider gets the override; every other provider
    // in the chain uses its own default model.
    const modelForThisProvider =
      request.forceProvider && providerName === request.forceProvider ? request.model : undefined;

    try {
      const response = await retryWithBackoff(
        () =>
          adapter.chat({
            messages: request.messages,
            model: modelForThisProvider,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
          }),
        { maxRetries: env.maxRetries }
      );

      recordSuccess(providerName, response.latencyMs);

      if (attempted.length > 1) {
        failoverLogger.info('Request succeeded after failover', {
          finalProvider: providerName,
          chain: attempted,
        });
      }

      return { response, failoverChain: attempted };
    } catch (err) {
      const pErr = err instanceof ProviderError ? err : undefined;
      recordFailure(providerName, pErr?.code ?? 'UNKNOWN', (err as Error).message);
      failures.push({ provider: providerName, error: (err as Error).message });

      logger.warn('Provider failed, attempting failover', {
        provider: providerName,
        error: (err as Error).message,
        nextCandidates: order.slice(attempted.length),
      });
      // loop continues to next provider
    }
  }

  throw new AllProvidersFailedError(failures);
}

/**
 * Streaming variant of routeChat. Because a provider can fail mid-stream
 * (after already emitting tokens to the client), we only allow failover
 * before the first chunk is sent. Once tokens have started flowing, a
 * failure is surfaced to the caller rather than silently restarting output
 * from a different provider, which would look broken to the end user.
 */
export async function routeChatStream(
  request: ChatRequest,
  onChunk: (chunk: StreamChunk) => void
): Promise<RouteResult> {
  const order = candidateOrder(request);
  if (order.length === 0) {
    throw new Error(
      requestHasImages(request)
        ? 'No vision-capable providers are configured. Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY to send images.'
        : 'No providers are configured. Set at least one *_API_KEY in .env'
    );
  }

  const attempted: ProviderName[] = [];
  const failures: { provider: ProviderName; error: string }[] = [];

  for (const providerName of order) {
    attempted.push(providerName);
    const adapter = getProvider(providerName);
    let emittedAnyChunk = false;
    // See routeChat for why this is scoped to only the forced provider.
    const modelForThisProvider =
      request.forceProvider && providerName === request.forceProvider ? request.model : undefined;

    try {
      const response = await adapter.chatStream(
        {
          messages: request.messages,
          model: modelForThisProvider,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        },
        (chunk) => {
          emittedAnyChunk = emittedAnyChunk || chunk.delta.length > 0;
          onChunk(chunk);
        }
      );

      recordSuccess(providerName, response.latencyMs);
      return { response, failoverChain: attempted };
    } catch (err) {
      const pErr = err instanceof ProviderError ? err : undefined;
      recordFailure(providerName, pErr?.code ?? 'UNKNOWN', (err as Error).message);
      failures.push({ provider: providerName, error: (err as Error).message });

      if (emittedAnyChunk) {
        // Tokens already reached the client under this provider's name —
        // don't silently switch mid-stream. Bubble the error up instead.
        throw new AllProvidersFailedError(failures);
      }

      logger.warn('Provider failed before streaming began, attempting failover', {
        provider: providerName,
        error: (err as Error).message,
      });
    }
  }

  throw new AllProvidersFailedError(failures);
}
