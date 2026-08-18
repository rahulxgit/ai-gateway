import { ProviderAdapterOptions, ProviderError, ProviderName, ProviderResponse } from '../types';
import { providerRegistry } from '../providers/registry';
import {
  FREE_AUTO_PROVIDERS,
  PAID_AUTO_PROVIDERS,
  TASK_ROUTING,
  buildAutoProviderOrder,
} from '../config/routing';

jest.mock('../providers/registry', () => {
  const actual = jest.requireActual('../providers/registry');
  return { ...actual, listConfiguredProviders: jest.fn(), getProvider: jest.fn() };
});

import { listConfiguredProviders, getProvider } from '../providers/registry';
import { routeChat, AllProvidersFailedError } from '../services/router.service';
import { recordSuccess, recordFailure } from '../services/health.service';

jest.mock('../config/env', () => ({
  env: { ...jest.requireActual('../config/env').env, gatewayRequestBudgetMs: 2000, maxRetries: 0 },
}));

function mockAdapter(name: ProviderName, impl: (options: ProviderAdapterOptions) => Promise<ProviderResponse>) {
  return {
    name,
    defaultModel: 'test-model',
    supportsVision: true,
    isConfigured: () => true,
    chat: jest.fn(impl),
    chatStream: jest.fn(),
  };
}

// -----------------------------------------------------------------------
// Structural coverage: a provider that's registered and configured but
// missing from every routing pool is a silent dead end — it can never be
// reached by automatic routing no matter what task type or freeOnly value
// is requested, and nothing would ever surface that at runtime.
// -----------------------------------------------------------------------
describe('routing config — every registered provider is reachable somewhere', () => {
  const allRegistered = Object.keys(providerRegistry) as ProviderName[];

  // Providers deliberately excluded from both pools pending a fix that
  // isn't a routing bug (e.g. missing API key in prod). Keep this list
  // explicit and reviewed, rather than letting a provider go missing by
  // accident — see config/routing.ts for the reasoning per entry.
  const knownExclusions: ProviderName[] = ['githubmodels'];

  it('is a member of FREE_AUTO_PROVIDERS, PAID_AUTO_PROVIDERS, or a documented exclusion', () => {
    const reachable = new Set([...FREE_AUTO_PROVIDERS, ...PAID_AUTO_PROVIDERS]);
    const unreachable = allRegistered.filter((p) => !reachable.has(p) && !knownExclusions.includes(p));
    expect(unreachable).toEqual([]);
  });

  it('has no provider double-booked in both the free and paid pools', () => {
    const overlap = FREE_AUTO_PROVIDERS.filter((p) => PAID_AUTO_PROVIDERS.includes(p));
    expect(overlap).toEqual([]);
  });

  it('gives every TASK_ROUTING entry the exact same free-provider set as FREE_AUTO_PROVIDERS', () => {
    const expected = [...FREE_AUTO_PROVIDERS].sort();
    for (const [, order] of Object.entries(TASK_ROUTING)) {
      expect([...order].sort()).toEqual(expected);
    }
  });

  it('buildAutoProviderOrder never returns duplicates or providers outside the known pools', () => {
    const known = new Set([...FREE_AUTO_PROVIDERS, ...PAID_AUTO_PROVIDERS]);
    for (const taskType of Object.keys(TASK_ROUTING) as (keyof typeof TASK_ROUTING)[]) {
      for (const freeOnly of [true, false, undefined]) {
        const order = buildAutoProviderOrder(taskType, freeOnly);
        expect(new Set(order).size).toBe(order.length);
        expect(order.every((p) => known.has(p))).toBe(true);
      }
    }
  });

  it('freeOnly:false always places every free provider ahead of every paid provider', () => {
    for (const taskType of Object.keys(TASK_ROUTING) as (keyof typeof TASK_ROUTING)[]) {
      const order = buildAutoProviderOrder(taskType, false);
      const lastFreeIdx = Math.max(...FREE_AUTO_PROVIDERS.map((p) => order.indexOf(p)));
      const firstPaidIdx = Math.min(...PAID_AUTO_PROVIDERS.map((p) => order.indexOf(p)).filter((i) => i >= 0));
      expect(lastFreeIdx).toBeLessThan(firstPaidIdx);
    }
  });
});

// -----------------------------------------------------------------------
// Runtime dead end: health cooldowns are a heuristic (last known state),
// not a guarantee the provider is still broken. If every eligible provider
// happens to be in cooldown at once, the gateway must still make a real
// attempt rather than fail synthetically for up to 30 minutes.
// -----------------------------------------------------------------------
describe('routeChat — health cooldowns never create a total dead end', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('probes eligible providers anyway when all of them are simultaneously in cooldown', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'openrouter']);
    recordFailure('gemini', 'QUOTA_EXCEEDED', 'gemini: daily quota exhausted');
    recordFailure('openrouter', 'QUOTA_EXCEEDED', 'openrouter: daily quota exhausted');

    const gemini = mockAdapter('gemini', async () => {
      throw new ProviderError('gemini', 'QUOTA_EXCEEDED', 'still exhausted');
    });
    const openrouter = mockAdapter('openrouter', async () => ({
      provider: 'openrouter',
      model: 'openai/gpt-oss-120b:free',
      content: 'quota actually reset already',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      latencyMs: 5,
      estimatedCostUsd: 0,
    }));
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => ({ gemini, openrouter }[name as 'gemini' | 'openrouter']));

    // Without the probe-anyway fallback this would throw a plain "No free
    // automatic providers are currently available" Error before either
    // adapter's chat() is ever called — a synthetic failure despite
    // openrouter's quota having actually reset in the real world.
    const result = await routeChat({ messages: [{ role: 'user', content: 'hello' }] });
    expect(result.response.provider).toBe('openrouter');
    expect(gemini.chat).toHaveBeenCalledTimes(1);
    expect(openrouter.chat).toHaveBeenCalledTimes(1);
  });

  it('still reports AllProvidersFailedError (not a dead-end silent no-op) if every probed provider genuinely fails', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'openrouter']);
    recordFailure('gemini', 'QUOTA_EXCEEDED', 'gemini: daily quota exhausted');
    recordFailure('openrouter', 'QUOTA_EXCEEDED', 'openrouter: daily quota exhausted');

    const gemini = mockAdapter('gemini', async () => { throw new ProviderError('gemini', 'QUOTA_EXCEEDED', 'still exhausted'); });
    const openrouter = mockAdapter('openrouter', async () => { throw new ProviderError('openrouter', 'QUOTA_EXCEEDED', 'still exhausted'); });
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => ({ gemini, openrouter }[name as 'gemini' | 'openrouter']));

    const err = await routeChat({ messages: [{ role: 'user', content: 'hello' }] }).catch((e) => e);
    expect(err).toBeInstanceOf(AllProvidersFailedError);
    expect((err as AllProvidersFailedError).attempts).toHaveLength(2);
    expect(gemini.chat).toHaveBeenCalledTimes(1);
    expect(openrouter.chat).toHaveBeenCalledTimes(1);
  });

  it('does NOT probe-anyway when only some providers are in cooldown — the healthy ones are used normally', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'openrouter']);
    recordSuccess('gemini', 10);
    recordFailure('openrouter', 'QUOTA_EXCEEDED', 'openrouter: daily quota exhausted');

    const gemini = mockAdapter('gemini', async () => ({
      provider: 'gemini', model: 'gemini-3.1-flash-lite', content: 'healthy path, as normal',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 5, estimatedCostUsd: 0,
    }));
    const openrouter = mockAdapter('openrouter', async () => { throw new Error('cooling-down provider must not be probed while a healthy one exists'); });
    (getProvider as jest.Mock).mockImplementation((name: ProviderName) => ({ gemini, openrouter }[name as 'gemini' | 'openrouter']));

    const result = await routeChat({ messages: [{ role: 'user', content: 'hello' }] });
    expect(result.response.provider).toBe('gemini');
    expect(openrouter.chat).not.toHaveBeenCalled();
  });

  it('reports a genuine "nothing configured" dead end honestly when there truly are zero eligible providers', async () => {
    (listConfiguredProviders as jest.Mock).mockReturnValue([]);
    await expect(routeChat({ messages: [{ role: 'user', content: 'hello' }] })).rejects.toThrow(
      'No free automatic providers are currently available'
    );
  });
});
