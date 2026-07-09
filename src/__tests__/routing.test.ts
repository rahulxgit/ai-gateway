import { buildProviderOrder, DEFAULT_FAILOVER_ORDER } from '../config/routing';

describe('buildProviderOrder', () => {
  it('puts a forced provider first, then the rest of the default chain', () => {
    const order = buildProviderOrder(undefined, 'huggingface');
    expect(order[0]).toBe('huggingface');
    expect(new Set(order)).toEqual(new Set(DEFAULT_FAILOVER_ORDER));
    expect(order).toHaveLength(DEFAULT_FAILOVER_ORDER.length);
  });

  it('prioritizes task-preferred providers for coding tasks', () => {
    const order = buildProviderOrder('coding', undefined);
    expect(order.slice(0, 4)).toEqual(['anthropic', 'gemini', 'openai', 'openrouter']);
  });

  it('falls back to the default order for unrecognized/general task type', () => {
    const order = buildProviderOrder('general', undefined);
    expect(order).toEqual(DEFAULT_FAILOVER_ORDER);
  });

  it('never drops or duplicates a provider', () => {
    for (const task of ['coding', 'reasoning', 'creative', 'fast', 'cheap', 'large-context'] as const) {
      const order = buildProviderOrder(task, undefined);
      expect(new Set(order).size).toBe(order.length);
      expect(new Set(order)).toEqual(new Set(DEFAULT_FAILOVER_ORDER));
    }
  });
});
