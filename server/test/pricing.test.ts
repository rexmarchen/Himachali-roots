import { describe, expect, it } from 'vitest';
import { allocate, commissionOn, shippingFor, taxComponentInclusive } from '../lib/pricing.js';

describe('money helpers', () => {
  it('allocates integer paise without losing a single paisa', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1, [1, 1])).toEqual([1, 0]);
    expect(allocate(0, [5, 3])).toEqual([0, 0]);
    expect(allocate(10_000, [1, 2, 3]).reduce((sum, value) => sum + value, 0)).toBe(10_000);
  });

  it('extracts GST from an inclusive price without changing the payable amount', () => {
    expect(taxComponentInclusive(112_000, 1200)).toBe(12_000);
    expect(taxComponentInclusive(100_000, 0)).toBe(0);
    expect(taxComponentInclusive(0, 1800)).toBe(0);
  });

  it('rounds commission once and never returns a negative amount', () => {
    expect(commissionOn(100_000, 1500)).toBe(15_000);
    expect(commissionOn(99_999, 1500)).toBe(15_000);
    expect(commissionOn(1, 1500)).toBe(0);
    expect(commissionOn(-100, 1500)).toBe(0);
  });

  it('charges flat shipping below the threshold and nothing above it', () => {
    expect(shippingFor(0)).toBe(0);
    expect(shippingFor(1)).toBe(7_900);
    expect(shippingFor(149_900)).toBe(0);
    expect(shippingFor(500_000)).toBe(0);
  });
});
