import {
  ChatRequest,
  ProviderError,
  ProviderName,
  ProviderResponse,
  StreamChunk,
} from '../types';
import { buildProviderOrder, FREE_AUTO_PROVIDERS } from '../config/routing';
import { getProvider, listConfiguredProviders } from '../providers/registry';
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
    super('All eligible providers failed to fulfill the request');
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

  if (request.forceProvider) {
    if (!configured.has(request.forceProvider)) return [];
    const adapter = getProvider(request.forceProvider);
    if (requestHasImages(request) && !adapter.supportsVision) return [];
    return [request.forceProvider];
  }

  const order = buildProviderOrder(request.taskType, undefined).filter(
    (provider) => FREE_AUTO_PROVIDERS.includes(provider) && configured.has(provider)
  );

  const eligible = requestHasImages(request)
    ? order.filter((p) => getProvider(p).supportsVision)
    : order;

  return eligible.filter((p) => isLikelyHealthy(p));
}

function modelForProvider(request: ChatRequest, providerName: ProviderName): string | undefined {
  return request.forceProvider === providerName ? request.model : undefined;
}

function retryDelayMs(retryNumber: number): number {
  const jitter = Math.random() * 100;
  return Math.min(400 * 2 ** (retryNumber - 1) + jitter, 8_000);
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes one provider request within the gateway's global deadline.
 * Rate-limit/quota errors intentionally bypass same-provider retries because
 * retries can consume scarce free-tier capacity without increasing success.
 */
async function callWithBudget<T>(
  fn: () => Promise<T>,
  deadline: number
): Promise<T> {
  for (let retryNumber = 0; ; retryNumber += 1) {
    const remainingBudgetMs = deadline - Date.now();
    if (remainingBudgetMs <= 0) throw new GatewayRequestBudgetExceededError();

    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new GatewayRequestBudgetExceededError()), remainingBudgetMs);
        }),
      ]);
    } catch (err) {
      if (err instanceof GatewayRequestBudgetExceededError) throw err;

      const pErr = err instanceof ProviderError ? err : undefined;
      const retryable = pErr?.retryable ?? true;
      const blockedByQuota = pErr?.code === 'RATE_LIMITED' || pErr?.code === 'QUOTA_EXCEEDED';

      if (!retryable || blockedByQuota || retryNumber >= env.maxRetries) throw err;

      const delayMs = retryDelayMs(retryNumber + 1);
      const afterDelayRemainingMs = deadline - Date.now() - delayMs;
      if (afterDelayRemainingMs <= 0) throw new GatewayRequestBudgetExceededError();

      logger.warn('Retrying provider within gateway request budget', {
        provider: pErr?.provider,
        retryNumber: retryNumber + 1,
        maxRetries: env.maxRetries,
        delayMs: Math.round(delayMs),
        remainingBudgetMs: Math.max(0, Math.round(deadline - Date.now())),
      });
      await sleep(delayMs);
    }
  }
}

export async function routeChat(request: ChatRequest, correlationId?: string): Promise<RouteResult> {
  const order = candidateOrder(request);
  if (order.length === 0) {
    throw new Error(
      request.forceProvider
        ? `Forced provider \"${request.forceProvider}\" is not configured or cannot handle this request.`
        : requestHasImages(request)
          ? 'No vision-capable free providers are currently available.'
          : 'No free automatic providers are currently available.'
    );
  }

  const attempted: ProviderName[] = [];
  const failures: { provider: ProviderName; error: string }[] = [];
  const deadline = Date.now() + env.gatewayRequestBudgetMs;

  for (const providerName of order) {
    if (deadline - Date.now() <= 0) throw new GatewayRequestBudgetExceededError();

    attempted.push(providerName);
    const adapter = getProvider(providerName);
    const model = modelForProvider(request, providerName);

    try {
      const response = await callWithBudget(
        () =>
          adapter.chat({
            messages: request.messages,
            model,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
          }),
        deadline
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
      request.forceProvider
        ? `Forced provider \"${request.forceProvider}\" is not configured or cannot handle this request.`
        : requestHasImages(request)
          ? 'No vision-capable free providers are currently available.'
          : 'No free automatic providers are currently available.'
    );
  }

  const attempted: ProviderName[] = [];
  const failures: { provider: ProviderName; error: string }[] = [];
  const deadline = Date.now() + env.gatewayRequestBudgetMs;

  for (const providerName of order) {
    if (deadline - Date.now() <= 0) throw new GatewayRequestBudgetExceededError();

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
          const remainingBudgetMs = deadline - Date.now();
          setTimeout(() => reject(new GatewayRequestBudgetExceededError()), Math.max(0, remainingBudgetMs));
        }),
      ]);

      recordSuccess(providerName, response.latencyMs, correlationId);
      return { response, failoverChain: attempted };
    } catch (err) {
      if (err instanceof GatewayRequestBudgetExceededError) throw err;

      const pErr = err instanceof ProviderError ? err : undefined;
      recordFailure(providerName, pErr?.code ?? 'UNKNOWN', (err as Error).message, correlationId);
      failures.push({ provider: providerName, error: (err as Error).message });

      if (emittedAnyChunk) throw new AllProvidersFailedError(failures);

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
