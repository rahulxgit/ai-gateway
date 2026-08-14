import { AxiosError, AxiosResponse } from 'axios';
import { classifyError, createSseFrameParser, estimateCost } from '../providers/base.adapter';
import { ProviderError } from '../types';

function fakeAxiosError(status?: number, code?: string, data?: unknown): AxiosError {
  return {
    isAxiosError: true,
    code,
    message: code === 'ECONNABORTED' ? 'timeout of 30000ms exceeded' : 'Request failed',
    response: status ? ({ status, data } as Partial<AxiosResponse> as AxiosResponse) : undefined,
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

  it('classifies 401 as AUTH_ERROR', () => {
    expect(classifyError('anthropic', fakeAxiosError(401)).code).toBe('AUTH_ERROR');
    expect(classifyError('anthropic', fakeAxiosError(401)).retryable).toBe(false);
  });

  it('classifies an ordinary 403 as FORBIDDEN instead of pretending it is an invalid key', () => {
    const err = classifyError('anthropic', fakeAxiosError(403));
    expect(err.code).toBe('FORBIDDEN');
    expect(err.retryable).toBe(false);
  });

  it('classifies a 403 with balance language as INSUFFICIENT_CREDITS', () => {
    const err = classifyError(
      'novita',
      fakeAxiosError(403, undefined, {
        code: 403,
        reason: 'NOT_ENOUGH_BALANCE',
        message: 'not enough balance',
      })
    );
    expect(err.code).toBe('INSUFFICIENT_CREDITS');
    expect(err.retryable).toBe(false);
    expect(err.message).toContain('balance');
  });

  it('classifies a 403 invalid API key as FORBIDDEN and preserves the provider distinction', () => {
    const err = classifyError(
      'novita',
      fakeAxiosError(403, undefined, { code: 403, reason: 'INVALID_API_KEY', message: 'invalid API key' })
    );
    expect(err.code).toBe('FORBIDDEN');
    expect(err.retryable).toBe(false);
  });

  it('classifies 402 as INSUFFICIENT_CREDITS and surfaces the provider message', () => {
    const err = classifyError(
      'inference',
      fakeAxiosError(402, undefined, { message: 'Insufficient funds. Please add a payment method.' })
    );
    expect(err.code).toBe('INSUFFICIENT_CREDITS');
    expect(err.retryable).toBe(false);
    expect(err.message).toContain('payment required');
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

  it('classifies a 400 with credit-balance language as INSUFFICIENT_CREDITS', () => {
    const err = classifyError(
      'anthropic',
      fakeAxiosError(400, undefined, {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Your credit balance is too low to access the Anthropic API.',
        },
      })
    );
    expect(err.code).toBe('INSUFFICIENT_CREDITS');
    expect(err.retryable).toBe(false);
  });

  it('classifies 404 as NOT_FOUND and non-retryable', () => {
    const err = classifyError('fireworks', fakeAxiosError(404));
    expect(err.code).toBe('NOT_FOUND');
    expect(err.retryable).toBe(false);
  });

  it('classifies 412 as ACCOUNT_SUSPENDED and surfaces the provider message', () => {
    const err = classifyError(
      'fireworks',
      fakeAxiosError(412, undefined, {
        error: 'Account is suspended, possibly due to reaching the monthly spending limit',
      })
    );
    expect(err.code).toBe('ACCOUNT_SUSPENDED');
    expect(err.retryable).toBe(false);
    expect(err.message).toContain('suspended');
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