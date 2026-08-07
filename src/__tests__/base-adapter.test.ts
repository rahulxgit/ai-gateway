import { AxiosError } from 'axios';
import { classifyError, createSseFrameParser, estimateCost } from '../providers/base.adapter';
import { ProviderError } from '../types';

function fakeAxiosError(status?: number, code?: string, data?: unknown): AxiosError {
  return {
    isAxiosError: true,
    code,
    message: code === 'ECONNABORTED' ? 'timeout of 30000ms exceeded' : 'Request failed',
    response: status ? ({ status, data } as any) : undefined,
    toJSON: () => ({}),
    name: 'AxiosError',
  } as AxiosError;
}

describe('classifyError', () => {
  it('classifies 429 as RATE_LIMITED by default', () => {
    const err = classifyError('gemini', fakeAxiosError(429, undefined, { error: {} }));
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.retryable).toBe(true);
  });

  it('classifies 429 with quota message as QUOTA_EXCEEDED', () => {
    const err = classifyError(
      'openai',
      fakeAxiosError(429, undefined, { error: { message: 'You exceeded your current quota' } })
    );
    expect(err.code).toBe('QUOTA_EXCEEDED');
  });

  it('classifies 401/403 as AUTH_ERROR', () => {
    expect(classifyError('anthropic', fakeAxiosError(401)).code).toBe('AUTH_ERROR');
    expect(classifyError('anthropic', fakeAxiosError(403)).code).toBe('AUTH_ERROR');
  });

  it('classifies 500+ as SERVER_ERROR and retryable', () => {
    const err = classifyError('groq', fakeAxiosError(503));
    expect(err.code).toBe('SERVER_ERROR');
    expect(err.retryable).toBe(true);
  });

  it('classifies 400/422 as INVALID_REQUEST and non-retryable', () => {
    const err = classifyError('together', fakeAxiosError(400));
    expect(err.code).toBe('INVALID_REQUEST');
    expect(err.retryable).toBe(false);
  });

  it('classifies 404 as NOT_FOUND and retryable (fails over to next provider)', () => {
    const err = classifyError('fireworks', fakeAxiosError(404));
    expect(err.code).toBe('NOT_FOUND');
    expect(err.retryable).toBe(true);
  });

  // Regression test: Fireworks returns HTTP 412 for a suspended account
  // (spending limit reached / no payment method / unpaid invoice), not a
  // 401/402/403. Before this, that fell through to the generic UNKNOWN
  // bucket, which made a billing problem look like an unexplained failure
  // in logs and health status instead of a clear "check your account"
  // signal.
  it('classifies 412 as ACCOUNT_SUSPENDED and surfaces the provider message', () => {
    const err = classifyError(
      'fireworks',
      fakeAxiosError(412, undefined, {
        error: 'Account superhello2099 is suspended, possibly due to reaching the monthly spending limit',
      })
    );
    expect(err.code).toBe('ACCOUNT_SUSPENDED');
    expect(err.retryable).toBe(true);
    expect(err.message).toContain('suspended');
  });

  it('classifies 412 with no body using a sensible default message', () => {
    const err = classifyError('fireworks', fakeAxiosError(412));
    expect(err.code).toBe('ACCOUNT_SUSPENDED');
    expect(err.message.toLowerCase()).toContain('suspended');
  });

  it('classifies ECONNABORTED as TIMEOUT', () => {
    const err = classifyError('openrouter', fakeAxiosError(undefined, 'ECONNABORTED'));
    expect(err.code).toBe('TIMEOUT');
  });

  it('classifies connection refused as UNAVAILABLE', () => {
    const err = classifyError('huggingface', fakeAxiosError(undefined, 'ECONNREFUSED'));
    expect(err.code).toBe('UNAVAILABLE');
  });

  it('passes through an existing ProviderError unchanged', () => {
    const original = new ProviderError('gemini', 'TIMEOUT', 'already classified');
    expect(classifyError('gemini', original)).toBe(original);
  });
});

describe('estimateCost', () => {
  it('computes cost proportional to tokens and price per 1k', () => {
    expect(estimateCost(1000, 0.006)).toBeCloseTo(0.006);
    expect(estimateCost(500, 0.006)).toBeCloseTo(0.003);
    expect(estimateCost(0, 0.006)).toBe(0);
  });
});

describe('createSseFrameParser', () => {
  it('waits for a complete SSE frame when JSON is split across network chunks', () => {
    const payloads: string[] = [];
    const parse = createSseFrameParser((data) => payloads.push(data));

    parse('data: {"choices":[{"delta":{"content":"Hel');
    parse('lo"}}]}\n\n');

    expect(payloads).toEqual(['{"choices":[{"delta":{"content":"Hello"}}]}']);
  });

  it('handles CRLF frames, comments, and multiple events in one chunk', () => {
    const payloads: string[] = [];
    const parse = createSseFrameParser((data) => payloads.push(data));

    parse(': keep-alive\r\ndata: first\r\n\r\ndata: second\r\n\r\n');

    expect(payloads).toEqual(['first', 'second']);
  });
});
