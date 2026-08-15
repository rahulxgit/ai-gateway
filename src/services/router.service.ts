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
  failoverChain: ProviderName[];
}

export class AllProvidersFailedError extends Error {
  public readonly attempts: { provider: ProviderName; error: string }[];
  constructor(attempts: { provider: ProviderName; error: string }[]) {
    super('All configured providers failed to fulfill the request');
    this.name = 'AllProvidersFailedError';
    this.attempts = attempts;
  }
}

export class GatewayRequestBudgetExceededError extends Error {
  constructor() {
    super('Gateway request time budget exceeded');
    this.name = 'GatewayRequestBudgetExceededError';
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

  const eligible = requestHasImages(request)
    ? order.filter((p) => getProvider(p).supportsVision)
    : order;

  // Keep rate-limited/down providers out of the hot path. The routing config
  // remains the source of truth for ordering, and unhealthy providers can
  // still be retried after the healthy candidates if everything else fails.
  const healthy = eligible.filter((p) => isLikelyHealthy(p));
  const degraded = eligible.filter((p) => !isLikelyHealthy(p));
  return [...healthy, ...degraded];
}

function modelForProvider(request: ChatRequest, providerName: ProviderName): string | undefined {
  return request.forceProvider && providerName === request.forceProvider ? request.model : undefined;
}

/**
 * Runs a non-streaming chat request through the free-first failover chain.
 * Automatic routing never falls through to a paid/credit-dependent provider;
 * explicit forceProvider remains available for manual provider selection.
 */
export async function routeChat(request: ChatRequest, correlationId?: string): Promise<RouteResult> {
  const order = candidateOrder(request);
  if (order.length === 0) {
    throw new Error(
      requestHasImages(request)
        ? 'No vision-capable free providers are configured. Set a free-tier provider API key such as GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY, MISTRAL_API_KEY, or the required Cloudflare credentials.'
        : 'No free automatic providers are configured. Set at least one free-tier provider API key.'
    );
  }

  const attempted: ProviderName[] = [];
  const failures: { provider: ProviderName; error: string }[] = [];
  const deadline = Date.now() + env.gatewayRequestBudgetMs;

  for (const providerName of order) {
    const remainingBudgetMs = deadline - Date.now();
    if (remainingBudgetMs <= 0) throw new GatewayRequestBudgetExceededError();

    attempted.push(providerName);
    const adapter = getProvider(providerName);
    const model = modelForProvider(request, providerName);

    try {
      const response = await retryWithBackoff(
        () =>
          Promise.race([
            adapter.chat({
              messages: request.messages,
              model,
              temperature: request.temperature,
              maxTokens: request.maxTokens,
            }),
            new Promise<ProviderResponse>((_, reject) => {
              setTimeout(() => reject(new GatewayRequestBudgetExceededError()), remainingBudgetMs);
            }),
          ]),
        { maxRetries: env.maxRetries }
      );

      recordSuccess(providerName, response.latencyMs, correlationId);
      if (attempted.length > 1) {
        failoverLogger.info('Request succeeded after failover', {
          correlationId,
          finalProvider: providerName,
          chain: attempted,
        });
      }
      return { response, failoverChain: attempted };
    } catch (err) {
      if (err instanceof GatewayRequestBudgetExceededError) throw err;

      const pErr = err instanceof ProviderError ? err : undefined;
      recordFailure(providerName, pErr?.code ?? 'UNKNOWN', (err as Error).message, correlationId);
      failures.push({ provider: providerName, error: (err as Error).message });

      logger.warn('Provider failed, attempting failover', {
        correlationId,
        provider: providerName,
        errorCode: pErr?.code,
        error: (err as Error).message,
        nextCandidates: order.slice(attempted.length),
      });
    }
  }

  throw new AllProvidersFailedError(failures);
}

export async function routeChatStream(
  request: ChatRequest,
  onChunk: (chunk: StreamChunk) => void,
  correlationId?: string
): Promise<RouteResult> {
  const order = candidateOrder(request);
  if (order.length === 0) {
    throw new Error(
      requestHasImages(request)
        ? 'No vision-capable free providers are configured. Set a free-tier provider API key.'
        : 'No free automatic providers are configured. Set at least one free-tier provider API key.'
    );
  }

  const attempted: ProviderName[] = [];
  const failures: { provider: ProviderName; error: string }[] = [];
  const deadline = Date.now() + env.gatewayRequestBudgetMs;

  for (const providerName of order) {
    const remainingBudgetMs = deadline - Date.now();
    if (remainingBudgetMs <= 0) throw new GatewayRequestBudgetExceededError();

    attempted.push(providerName);
    const adapter = getProvider(providerName);
    const model = modelForProvider(request, providerName);
    let emittedAnyChunk = false;

    try {
      const response = await Promise.race([
        adapter.chatStream(
          {
            messages: request.messages,
            model,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
          },
          (chunk) => {
            emittedAnyChunk = emittedAnyChunk || chunk.delta.length > 0;
            onChunk(chunk);
          }
        ),
        new Promise<ProviderResponse>((_, reject) => {
          setTimeout(() => reject(new GatewayRequestBudgetExceededError()), remainingBudgetMs);
        }),
      ]);

      recordSuccess(providerName, response.latencyMs, correlationId);
      return { response, failoverChain: attempted };
    } catch (err) {
      if (err instanceof GatewayRequestBudgetExceededError) throw err;

      const pErr = err instanceof ProviderError ? err : undefined;
      recordFailure(providerName, pErr?.code ?? 'UNKNOWN', (err as Error).message, correlationId);
      failures.push({ provider: providerName, error: (err as Error).message });

      if (emittedAnyChunk) {
        throw new AllProvidersFailedError(failures);
      }

      logger.warn('Provider failed before streaming began, attempting failover', {
        correlationId,
        provider: providerName,
        errorCode: pErr?.code,
        error: (err as Error).message,
      });
    }
  }

  throw new AllProvidersFailedError(failures);
}
