import { AxiosError } from 'axios';
import { ProviderError, ProviderErrorCode, ProviderName } from '../types';

/**
 * Convert raw provider/network failures into stable gateway error codes.
 * Health reporting uses these codes to distinguish invalid credentials,
 * edge/proxy 403s, billing failures, rate limits, and model failures.
 */
export function classifyError(provider: ProviderName, err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;

  const axiosErr = err as AxiosError;

  if (axiosErr?.code === 'ECONNABORTED' || axiosErr?.message?.toLowerCase().includes('timeout')) {
    return new ProviderError(provider, 'TIMEOUT', `${provider}: request timed out`);
  }

  const status = axiosErr?.response?.status;

  if (status === 401 || status === 403) {
    const body = axiosErr.response?.data as
      | { message?: string; reason?: string; error?: { message?: string } | string }
      | undefined;
    const msg =
      body?.message ??
      body?.reason ??
      (typeof body?.error === 'string' ? body.error : body?.error?.message) ??
      '';

    if (/not enough balance|insufficient (credit|balance|funds)|credit balance|low balance|add (a )?payment method/i.test(msg)) {
      return new ProviderError(provider, 'INSUFFICIENT_CREDITS', `${provider}: ${msg}`, status);
    }

    if (status === 401) {
      return new ProviderError(provider, 'AUTH_ERROR', `${provider}: authentication failed`, status);
    }

    return new ProviderError(
      provider,
      'FORBIDDEN',
      `${provider}: access forbidden (provider or network edge denied the request)`,
      status
    );
  }

  if (status === 402) {
    const body = axiosErr.response?.data as
      | { message?: string; error?: { message?: string } | string }
      | undefined;
    const msg =
      body?.message ?? (typeof body?.error === 'string' ? body.error : body?.error?.message) ?? '';
    return new ProviderError(
      provider,
      'INSUFFICIENT_CREDITS',
      `${provider}: payment required${msg ? ` — ${msg}` : ''}`,
      status
    );
  }

  if (status === 412) {
    const body = axiosErr.response?.data as { error?: { message?: string } | string } | undefined;
    const msg =
      (typeof body?.error === 'string' ? body.error : body?.error?.message) ??
      'account suspended (billing/spending limit)';
    return new ProviderError(provider, 'ACCOUNT_SUSPENDED', `${provider}: ${msg}`, status);
  }

  if (status === 404) {
    return new ProviderError(
      provider,
      'NOT_FOUND',
      `${provider}: model or endpoint not found — verify the configured model and provider endpoint`,
      status
    );
  }

  if (status === 429) {
    const body = axiosErr.response?.data as
      | { error?: { message?: string } | string; message?: string }
      | undefined;
    const msg =
      (typeof body?.error === 'string' ? body.error : body?.error?.message) ?? body?.message ?? '';
    const code: ProviderErrorCode = /quota|insufficient|credit/i.test(msg)
      ? 'QUOTA_EXCEEDED'
      : 'RATE_LIMITED';
    return new ProviderError(provider, code, `${provider}: ${msg || 'rate limited'}`, status);
  }

  if (status === 413) {
    const body = axiosErr.response?.data as { error?: { message?: string } | string } | undefined;
    const msg =
      (typeof body?.error === 'string' ? body.error : body?.error?.message) ??
      'request entity too large';
    if (/tokens per minute|\btpm\b|limit \d+,\s*requested \d+/i.test(msg)) {
      return new ProviderError(provider, 'RATE_LIMITED', `${provider}: ${msg}`, status);
    }
    return new ProviderError(provider, 'INVALID_REQUEST', `${provider}: ${msg}`, status);
  }

  if (status === 400 || status === 422) {
    const body = axiosErr.response?.data as
      | { error?: { message?: string } | string; message?: string }
      | undefined;
    const msg =
      (typeof body?.error === 'string' ? body.error : body?.error?.message) ?? body?.message ?? '';
    if (/credit balance|insufficient (credit|balance|funds)|add (a )?payment method|low balance/i.test(msg)) {
      return new ProviderError(provider, 'INSUFFICIENT_CREDITS', `${provider}: ${msg}`, status);
    }
    return new ProviderError(provider, 'INVALID_REQUEST', `${provider}: ${msg || 'invalid request'}`, status);
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
