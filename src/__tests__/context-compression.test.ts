import { shouldCompress, splitForCompression, mergeSummaryIntoMemory } from '../services/context-compression.service';
import { ChatMessage } from '../types';

function makeMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `message ${i}`,
  }));
}

describe('shouldCompress', () => {
  it('returns false at or below the 12,000 token trigger', () => {
    expect(shouldCompress(0)).toBe(false);
    expect(shouldCompress(12_000)).toBe(false);
  });

  it('returns true just above the trigger', () => {
    expect(shouldCompress(12_001)).toBe(true);
  });

  it('returns true for a very large token count', () => {
    expect(shouldCompress(1_000_000)).toBe(true);
  });
});

describe('splitForCompression', () => {
  it('keeps everything verbatim when history is at or below the 10-message threshold', () => {
    const history = makeMessages(10);
    const { toCompress, toKeep } = splitForCompression(history);
    expect(toCompress).toEqual([]);
    expect(toKeep).toEqual(history);
  });

  it('keeps everything verbatim for a short history well under the threshold', () => {
    const history = makeMessages(3);
    const { toCompress, toKeep } = splitForCompression(history);
    expect(toCompress).toEqual([]);
    expect(toKeep).toEqual(history);
  });

  it('splits older messages into toCompress and the last 10 into toKeep', () => {
    const history = makeMessages(15);
    const { toCompress, toKeep } = splitForCompression(history);
    expect(toCompress).toHaveLength(5);
    expect(toKeep).toHaveLength(10);
    expect(toCompress).toEqual(history.slice(0, 5));
    expect(toKeep).toEqual(history.slice(5));
  });

  it('never drops or duplicates a message across the two halves', () => {
    const history = makeMessages(23);
    const { toCompress, toKeep } = splitForCompression(history);
    expect([...toCompress, ...toKeep]).toEqual(history);
  });

  it('handles an empty history', () => {
    const { toCompress, toKeep } = splitForCompression([]);
    expect(toCompress).toEqual([]);
    expect(toKeep).toEqual([]);
  });
});

describe('mergeSummaryIntoMemory', () => {
  it('returns the new summary as-is when there is no existing summary', () => {
    expect(mergeSummaryIntoMemory(null, 'first summary')).toBe('first summary');
  });

  it('appends the new summary after the existing one, separated by a divider', () => {
    const merged = mergeSummaryIntoMemory('old summary', 'new summary');
    expect(merged).toBe('old summary\n\n---\n\nnew summary');
  });
});
