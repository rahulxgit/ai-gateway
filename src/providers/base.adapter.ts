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
  // 412 is billing-account-suspension in disguise for at least one provider
  // in this gateway (Fireworks: "Account is suspended, possibly due to
  // reaching the monthly spending limit or failure to pay past invoices").
  // Not an auth problem and not fixable by retrying — surfacing it as its
  // own code means health/logs say "billing issue" instead of "unknown".
  if (status === 412) {
    const body = axiosErr.response?.data as { error?: { message?: string } | string } | undefined;
    const msg =
      (typeof body?.error === 'string' ? body.error : body?.error?.message) ??
      'account suspended (billing/spending limit)';
    return new ProviderError(provider, 'ACCOUNT_SUSPENDED', `${provider}: ${msg}`, status);
  }
  if (status === 404) {
    // Distinct from a generic 4xx: the endpoint/model path itself wasn't
    // found, as opposed to the request body being rejected. Most commonly
    // a renamed/deprecated model ID, but can also mask an account-level
    // issue on providers that 404 instead of 402/403/412 for that case
    // (seen on Fireworks depending on which route is hit) — worth checking
    // the provider dashboard directly if the model ID is confirmed correct.
    return new ProviderError(
      provider,
      'NOT_FOUND',
      `${provider}: model or endpoint not found — check the model ID is still valid, and confirm the account isn't suspended`,
      status
    );
  }
  if (status === 429) {
    const body = axiosErr.response?.data as { error?: { message?: string } } | undefined;
    const msg = body?.error?.message ?? '';
    const code: ProviderErrorCode = /quota/i.test(msg) ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED';
    return new ProviderError(provider, code, `${provider}: ${msg || 'rate limited'}`, status);
  }
  // 413 is a disguised TPM (tokens-per-minute) rate limit on at least one
  // provider (Groq): "Request too large ... on tokens per minute (TPM):
  // Limit 8000, Requested 15088". It's not actually an oversized payload,
  // it's a retryable rate limit — classify it as such so the router fails
  // over instead of surfacing a confusing UNKNOWN.
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
    // Several providers (confirmed live: Anthropic) return a plain 400 for
    // "your account has no credits" rather than a 402/403 — e.g. "Your
    // credit balance is too low to access the Anthropic API." That's a
    // billing problem, not a malformed request, and looks completely
    // different in the router/health panel than a genuine bad payload.
    const body = axiosErr.response?.data as
      | { error?: { message?: string } | string; message?: string }
      | undefined;
    const msg =
      (typeof body?.error === 'string' ? body.error : body?.error?.message) ?? body?.message ?? '';
    if (/credit balance|insufficient (credit|balance|funds)|add (a )?payment method|low balance/i.test(msg)) {
      return new ProviderError(provider, 'INSUFFICIENT_CREDITS', `${provider}: ${msg}`, status);
    }
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
