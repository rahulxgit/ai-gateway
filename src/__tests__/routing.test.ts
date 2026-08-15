import { buildProviderOrder, DEFAULT_FAILOVER_ORDER, FREE_AUTO_PROVIDERS, TASK_ROUTING } from '../config/routing';

describe('buildProviderOrder', () => {
  it('returns only the explicitly forced provider', () => {
    expect(buildProviderOrder(undefined, 'huggingface')).toEqual(['huggingface']);
    expect(buildProviderOrder('coding', 'openrouter')).toEqual(['openrouter']);
  });

  it('prioritizes the task-specific free providers for coding tasks', () => {
    const order = buildProviderOrder('coding', undefined);
    expect(order).toEqual(TASK_ROUTING.coding);
    expect(order.every((provider) => FREE_AUTO_PROVIDERS.includes(provider))).toBe(true);
  });

  it('uses the default free order for general tasks', () => {
    expect(buildProviderOrder('general', undefined)).toEqual(DEFAULT_FAILOVER_ORDER);
  });

  it('never drops or duplicates providers from a task route', () => {
    for (const task of ['coding', 'reasoning', 'creative', 'fast', 'cheap', 'large-context'] as const) {
      const order = buildProviderOrder(task, undefined);
      expect(new Set(order).size).toBe(order.length);
      expect(order.every((provider) => FREE_AUTO_PROVIDERS.includes(provider))).toBe(true);
    }
  });
});
