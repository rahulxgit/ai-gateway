import { ProviderName } from '../types';

jest.mock('../providers/registry', () => {
  const actual = jest.requireActual('../providers/registry');
  return { ...actual, listConfiguredProviders: jest.fn() };
});

import { providerRegistry, listConfiguredProviders } from '../providers/registry';
import { getHealthSnapshot } from '../services/health.service';
import { runStartupHealthChecks, stopHealthCheckInterval } from '../services/health-check.service';

function snapshotFor(provider: string) {
  return getHealthSnapshot().find((h) => h.provider === provider);
}

describe('health-check.service — active probing', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    stopHealthCheckInterval();
  });

  it('probes every configured provider that implements probeHealth and records the result', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'anthropic']);
    const geminiProbe = jest.spyOn(providerRegistry.gemini, 'probeHealth' as never).mockResolvedValue(undefined as never);
    const anthropicProbe = jest.spyOn(providerRegistry.anthropic, 'probeHealth' as never).mockResolvedValue(undefined as never);

    await runStartupHealthChecks();

    expect(geminiProbe).toHaveBeenCalledTimes(1);
    expect(anthropicProbe).toHaveBeenCalledTimes(1);
    expect(snapshotFor('gemini')?.status).toBe('healthy');
    expect(snapshotFor('gemini')?.lastCheckSource).toBe('probe');
    expect(snapshotFor('anthropic')?.status).toBe('healthy');
    expect(snapshotFor('anthropic')?.lastCheckSource).toBe('probe');
  });

  it('records a classified failure (not a crash) when probeHealth rejects', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['groq']);
    const { ProviderError } = jest.requireActual('../types');
    jest
      .spyOn(providerRegistry.groq, 'probeHealth' as never)
      .mockRejectedValue(new ProviderError('groq', 'RATE_LIMITED', 'groq: rate limited') as never);

    await expect(runStartupHealthChecks()).resolves.toBeUndefined();
    expect(snapshotFor('groq')?.status).toBe('rate_limited');
    expect(snapshotFor('groq')?.lastCheckSource).toBe('probe');
  });

  it('does nothing and never throws for providers with no probeHealth implementation', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['cohere']);
    const original = providerRegistry.cohere.probeHealth;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (providerRegistry.cohere as any).probeHealth = undefined;

    await expect(runStartupHealthChecks()).resolves.toBeUndefined();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (providerRegistry.cohere as any).probeHealth = original;
  });

  it('resolves immediately (no-op) when no providers are configured', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue([]);
    await expect(runStartupHealthChecks()).resolves.toBeUndefined();
  });

  it('never throws even if every configured probe rejects', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['mistral', 'cloudflare'] as ProviderName[]);
    jest.spyOn(providerRegistry.mistral, 'probeHealth' as never).mockRejectedValue(new Error('network down') as never);
    jest.spyOn(providerRegistry.cloudflare, 'probeHealth' as never).mockRejectedValue(new Error('network down') as never);

    await expect(runStartupHealthChecks()).resolves.toBeUndefined();
    expect(snapshotFor('mistral')?.status).not.toBe('healthy');
    expect(snapshotFor('cloudflare')?.status).not.toBe('healthy');
  });
});
