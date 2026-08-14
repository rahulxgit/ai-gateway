import { AxiosError } from 'axios';
import { ProviderError, ProviderErrorCode, ProviderName } from '../types';

export function classifyError(provider: ProviderName, err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;

  const axiosErr = err as AxiosError;

  if (axiosErr?.code === 'ECONNABORTED' || axiosErr?.message?.toLowerCase().includes('timeout')) {
    return new ProviderError(provider, 'TIMEOUT', `${provider}: request timed out`);
  }

  const status = axiosErr?.response?.status;
  const body = axiosErr.response?.data as
    | { message?: string; reason?: string; code?: string | number; error?: { message?: string } | string }
    | undefined;
  const msg = (
    body?.message ??
    body?.reason ??
    body?.code?.toString() ??
    (typeof body?.error === 'string' ? body.error : body?.error?.message) ??
    ''
  ).toString();

  if (status === 401) {
    return new ProviderError(provider, 'AUTH_ERROR', `${provider}: authentication failed${msg ? ` — ${msg}` : ''}`, status);
  }

  if (status === 403) {
    if (/not enough balance|insufficient (credit|balance|funds)|credit balance|low balance|add (a )?payment method|billing|payment required/i.test(msg)) {
      return new ProviderError(provider, 'INSUFFICIENT_CREDITS', `${provider}: ${msg}`, status);
    }
    if (/invalid (api[-_ ]?key|token|credential)|unauthorized|authentication failed|not authenticated|bad token/i.test(msg)) {
      return new ProviderError(provider, 'AUTH_ERROR', `${provider}: authentication failed — ${msg}`, status);
    }
    return new ProviderError(
      provider,
      'FORBIDDEN',
      `${provider}: access forbidden (provider or network edge denied the request)${msg ? ` — ${msg}` : ''}`,
      status
    );
  }

  if (status === 402) {
    return new ProviderError(provider, 'INSUFFICIENT_CREDITS', `${provider}: payment required${msg ? ` — ${msg}` : ''}`, status);
  }

  if (status === 412) {
    return new ProviderError(
      provider,
      'ACCOUNT_SUSPENDED',
      `${provider}: ${msg || 'account suspended (billing/spending limit)'}`,
      status
    );
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
    const code: ProviderErrorCode = /quota|insufficient|credit|balance/i.test(msg)
      ? 'QUOTA_EXCEEDED'
      : 'RATE_LIMITED';
    return new ProviderError(provider, code, `${provider}: ${msg || 'rate limited'}`, status);
  }

  if (status === 413) {
    if (/tokens per minute|\btpm\b|limit \d+,\s*requested \d+/i.test(msg)) {
      return new ProviderError(provider, 'RATE_LIMITED', `${provider}: ${msg}`, status);
    }
    return new ProviderError(provider, 'INVALID_REQUEST', `${provider}: ${msg || 'request entity too large'}`, status);
  }

  if (status === 400 || status === 422) {
    if (/credit balance|insufficient (credit|balance|funds)|add (a )?payment method|low balance|billing/i.test(msg)) {
      return new ProviderError(provider, 'INSUFFICIENT_CREDITS', `${provider}: ${msg}`, status);
    }
    if (/invalid (api[-_ ]?key|token|credential)|unauthorized|authentication failed/i.test(msg)) {
      return new ProviderError(provider, 'AUTH_ERROR', `${provider}: authentication failed — ${msg}`, status);
    }
    return new ProviderError(provider, 'INVALID_REQUEST', `${provider}: ${msg || 'invalid request'}`, status);
  }

  if (status && status >= 500) {
    return new ProviderError(provider, 'SERVER_ERROR', `${provider}: server error (${status})`, status);
  }

  if (!status && (axiosErr?.code === 'ECONNREFUSED' || axiosErr?.code === 'ENOTFOUND')) {
    return new ProviderError(provider, 'UNAVAILABLE', `${provider}: unreachable`);
  }

  return new ProviderError(provider, 'UNKNOWN', `${provider}: ${(err as Error)?.message ?? 'unknown error'}`);
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
