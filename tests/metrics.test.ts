import { describe, expect, it } from 'vitest';
import {
  calculatePercentage,
  compatibilityWarnings,
  growthPercent,
  rankBySum,
  relativePeriod,
  returnRate,
  salesContribution,
} from '../src/analytics/metrics';

describe('deterministic business metrics', () => {
  describe('calculatePercentage', () => {
    it('computes a percentage with an explicit formula', () => {
      const result = calculatePercentage({
        numerator: 25,
        denominator: 200,
        numeratorLabel: 'Returned',
        denominatorLabel: 'Sold',
      });
      expect(result.percent).toBe(12.5);
      expect(result.formula).toContain('Returned');
      expect(result.formula).toContain('Sold');
    });

    it('refuses to divide by zero and never returns Infinity', () => {
      const result = returnRate(0, 0);
      expect(result.valid).toBe(false);
      expect(result.percent).toBeNull();
      expect(result.formula).toContain('zero');
    });

    it('rejects a negative denominator for a rate but allows signed growth', () => {
      expect(calculatePercentage({
        numerator: 1,
        denominator: -5,
        numeratorLabel: 'Returned',
        denominatorLabel: 'Sold',
      }).valid).toBe(false);
      expect(growthPercent(120, -100).valid).toBe(true);
    });

    it('rejects non-finite inputs', () => {
      const result = salesContribution(Number.NaN, 100);
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('missing or invalid');
    });
  });

  describe('growthPercent', () => {
    it('uses the previous period as denominator', () => {
      const result = growthPercent(150, 100);
      expect(result.percent).toBe(50);
      expect(result.formula).toContain('150');
      expect(result.formula).toContain('100');
    });

    it('handles a zero previous period without inventing a percentage', () => {
      const result = growthPercent(50, 0);
      expect(result.valid).toBe(false);
      expect(result.percent).toBeNull();
    });
  });

  describe('rankBySum', () => {
    const rows = [
      { product: 'HDMI Cable', amount: 100 },
      { product: 'HDMI Cable', amount: 50 },
      { product: 'Touch Screen', amount: 300 },
      { product: 'Adapter', amount: 'not-a-number' },
    ];

    it('ranks by summed value and limits results', () => {
      const result = rankBySum(rows, { keyField: 'product', valueField: 'amount', limit: 1 });
      expect(result.items).toEqual([{ key: 'Touch Screen', value: 300, count: 1 }]);
      expect(result.truncated).toBe(true);
      expect(result.totalGroups).toBe(2);
    });

    it('reports excluded rows with unusable values', () => {
      const result = rankBySum(rows, { keyField: 'product', valueField: 'amount', limit: 10 });
      expect(result.warnings.some((warning) => warning.includes('excluded'))).toBe(true);
    });

    it('uses an explicit label for blank keys', () => {
      const result = rankBySum([{ product: '', amount: 10 }], { keyField: 'product', valueField: 'amount' });
      expect(result.items[0].key).toBe('(unspecified)');
    });

    it('can rank lowest values first for low-stock questions', () => {
      const result = rankBySum(rows, {
        keyField: 'product',
        valueField: 'amount',
        ascending: true,
        limit: 2,
      });
      expect(result.items.map((item) => item.key)).toEqual(['HDMI Cable', 'Touch Screen']);
    });
  });

  describe('compatibilityWarnings', () => {
    it('refuses to combine different currencies or units silently', () => {
      const warnings = compatibilityWarnings([
        { currency: 'USD', unit: 'EA' },
        { currency: 'EUR', unit: 'BOX' },
      ]);
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain('currency');
      expect(warnings[1]).toContain('unit');
    });

    it('returns no warnings for a consistent context', () => {
      expect(compatibilityWarnings([{ currency: 'USD' }, { currency: 'USD' }])).toEqual([]);
    });
  });

  describe('relativePeriod', () => {
    it('produces an explicit ISO range for a look-back window', () => {
      const result = relativePeriod(new Date('2026-11-19T00:00:00Z'), { months: 6 });
      expect(result.from).toBe('2026-05-19T00:00:00.000Z');
      expect(result.to).toBe('2026-11-19T00:00:00.000Z');
      expect(result.label).toContain('6 month');
    });
  });
});
