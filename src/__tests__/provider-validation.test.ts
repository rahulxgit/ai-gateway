import { chatRequestSchema } from '../middleware';
import { PROVIDER_NAMES } from '../types';
import { providerRegistry } from '../providers/registry';

// Regression test for a real bug: chatRequestSchema.forceProvider had its
// own hand-copied enum of provider names, separate from PROVIDER_NAMES and
// providerRegistry. When 10 new providers were registered and wired up
// end-to-end, this schema was never updated — so every one of them was
// rejected with a 400 before the request ever reached the adapter, even
// though the adapter itself worked. This test fails immediately if that
// happens again for any newly added provider.
describe('chatRequestSchema.forceProvider', () => {
  it('accepts every provider name in PROVIDER_NAMES', () => {
    for (const provider of PROVIDER_NAMES) {
      const result = chatRequestSchema.safeParse({
        messages: [{ role: 'user', content: 'hi' }],
        forceProvider: provider,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts every provider actually registered in providerRegistry', () => {
    for (const provider of Object.keys(providerRegistry)) {
      const result = chatRequestSchema.safeParse({
        messages: [{ role: 'user', content: 'hi' }],
        forceProvider: provider,
      });
      expect(result.success).toBe(true);
    }
  });

  it('still rejects a provider name that was never registered', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'hi' }],
      forceProvider: 'not-a-real-provider',
    });
    expect(result.success).toBe(false);
  });

  it('PROVIDER_NAMES and providerRegistry stay in sync', () => {
    const registryKeys = Object.keys(providerRegistry).sort();
    const typeNames = [...PROVIDER_NAMES].sort();
    expect(registryKeys).toEqual(typeNames);
  });
});
