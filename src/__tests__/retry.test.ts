import { retryWithBackoff } from '../utils/retry';
import { ProviderError, ProviderErrorCode } from '../types';

describe('retryWithBackoff', () => {
  it('returns the result immediately on success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries retryable errors up to maxRetries then throws', async () => {
    const err = new ProviderError('gemini', 'TIMEOUT', 'timed out');
    const fn = jest.fn().mockRejectedValue(err);

    await expect(
      retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 1 })
    ).rejects.toThrow('timed out');

    expect(fn).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  it.each([
    'INVALID_REQUEST',
    'AUTH_ERROR',
    'NOT_FOUND',
    'ACCOUNT_SUSPENDED',
    'INSUFFICIENT_CREDITS',
  ] as ProviderErrorCode[])('does not retry %s errors', async (code) => {
    const err = new ProviderError('gemini', code, `${code} failure`);
    const fn = jest.fn().mockRejectedValue(err);

    expect(err.retryable).toBe(false);
    await expect(
      retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 1 })
    ).rejects.toThrow(`${code} failure`);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('succeeds after transient failures', async () => {
    const err = new ProviderError('gemini', 'SERVER_ERROR', '503');
    const fn = jest
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('recovered');

    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
