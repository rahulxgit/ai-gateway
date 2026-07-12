import { AxiosError } from 'axios';
import { ProviderError, ProviderErrorCode, ProviderName } from '../types';

/**
 * Shared logic for turning a raw axios/network error into a classified
 * ProviderError. Every adapter calls this in its catch block so the router
 * has a consistent signal for "should I fail over?".
 */
export function classifyError(provider: ProviderName, err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;

  const axiosErr = err as AxiosError;

  if (axiosErr?.code === 'ECONNABORTED' || axiosErr?.message?.includes('timeout')) {
    return new ProviderError(provider, 'TIMEOUT', `${provider}: request timed out`);
  }

  const status = axiosErr?.response?.status;

  if (status === 401 || status === 403) {
    return new ProviderError(provider, 'AUTH_ERROR', `${provider}: authentication failed`, status);
  }
  if (status === 429) {
    const body = axiosErr.response?.data as { error?: { message?: string } } | undefined;
    const msg = body?.error?.message ?? '';
    const code: ProviderErrorCode = /quota/i.test(msg) ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED';
    return new ProviderError(provider, code, `${provider}: ${msg || 'rate limited'}`, status);
  }
  if (status === 400 || status === 422) {
    return new ProviderError(provider, 'INVALID_REQUEST', `${provider}: invalid request`, status);
  }
  if (status && status >= 500) {
    return new ProviderError(provider, 'SERVER_ERROR', `${provider}: server error (${status})`, status);
  }
  if (!status && (axiosErr?.code === 'ECONNREFUSED' || axiosErr?.code === 'ENOTFOUND')) {
    return new ProviderError(provider, 'UNAVAILABLE', `${provider}: unreachable`);
  }

  return new ProviderError(
    provider,
    'UNKNOWN',
    `${provider}: ${(err as Error)?.message ?? 'unknown error'}`
  );
}

export function estimateCost(totalTokens: number, pricePer1k: number): number {
  return Number(((totalTokens / 1000) * pricePer1k).toFixed(6));
}

/**
 * Turns arbitrary network chunks from an SSE response into complete `data:`
 * payloads. TCP/HTTP chunk boundaries are unrelated to SSE event boundaries,
 * so parsing each incoming chunk independently can drop split JSON events.
 */
export function createSseFrameParser(onData: (data: string) => void) {
  let buffer = '';

  return (chunk: Buffer | string): void => {
    buffer = (buffer + chunk.toString()).replace(/\r\n/g, '\n');

    let frameEnd = buffer.indexOf('\n\n');
    while (frameEnd !== -1) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);

      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');

      if (data) onData(data);
      frameEnd = buffer.indexOf('\n\n');
    }
  };
}
