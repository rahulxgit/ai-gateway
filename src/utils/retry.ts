import { ProviderError } from '../types';
import { logger } from './logger';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes fn with exponential backoff. Only retries when the thrown error
 * is a ProviderError marked retryable (e.g. rate limit, timeout, 5xx).
 * Non-retryable errors (bad request, auth) are re-thrown immediately so the
 * router can decide to fail over to a different provider instead of wasting
 * time retrying a doomed call against the same one.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, baseDelayMs = 400, maxDelayMs = 8_000 } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const retryable = err instanceof ProviderError ? err.retryable : true;
      if (!retryable || attempt === maxRetries) {
        throw err;
      }

      const jitter = Math.random() * 100;
      const delay = Math.min(baseDelayMs * 2 ** attempt + jitter, maxDelayMs);

      logger.warn('Retrying after failure', {
        attempt: attempt + 1,
        maxRetries,
        delayMs: Math.round(delay),
        error: err instanceof Error ? err.message : String(err),
      });

      await sleep(delay);
    }
  }

  throw lastError;
}
