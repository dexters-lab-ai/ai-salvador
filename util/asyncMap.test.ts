
// Fix: Add imports for jest globals to fix typescript errors.
import { describe, it, expect } from '@jest/globals';
import { asyncMap } from '../convex/util/asyncMap';

describe('asyncMap', () => {
  it('should map over a list asynchronously', async () => {
    const list = [1, 2, 3];
    const result = await asyncMap(list, async (item: number) => item * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  it('should handle empty list input', async () => {
    const list: number[] = [];
    const result = await asyncMap(list, async (item: number) => item * 2);
    expect(result).toEqual([]);
  });
});