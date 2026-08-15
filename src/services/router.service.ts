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

function callWithBudget<T>(fn: () => Promise<T>, deadline: number): Promise<T> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return Promise.reject(new GatewayRequestBudgetExceededError());

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new GatewayRequestBudgetExceededError());
    }, remainingMs);

    fn()
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function routeChat(request: ChatRequest, correlationId?: string): Promise<RouteResult> {
  const order = candidateOrder(request);
  if (order.length === 0) {
    throw new Error(
      request.forceProvider
        ? `Forced provider "${request.forceProvider}" is not configured or cannot handle this request.`
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
        ? `Forced provider "${request.forceProvider}" is not configured or cannot handle this request.`
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
      const response = await callWithBudget(
        () =>
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
        deadline
      );

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
