import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectBusinessSignals, resolveBusinessEntities } from '../src/metadata/business';
import { MetadataCatalog } from '../src/metadata/catalog';
import type { MetadataCatalogData } from '../src/metadata/types';

const cachePath = path.resolve(process.cwd(), 'data', 'metadata-cache.json');
let cache: MetadataCatalogData | undefined;
try {
  cache = JSON.parse(readFileSync(cachePath, 'utf8')) as MetadataCatalogData;
} catch {
  cache = undefined;
}

describe('business terminology discovery', () => {
  it('detects English and Arabic domains without hardcoding entity names', () => {
    expect(detectBusinessSignals('HDMI sales').map((signal) => signal.category)).toContain('sales');
    expect(detectBusinessSignals('most returned product').map((signal) => signal.category)).toContain('returns');
    expect(detectBusinessSignals('low inventory').map((signal) => signal.category)).toContain('inventory');
    expect(detectBusinessSignals('ما هي المبيعات').map((signal) => signal.category)).toContain('sales');
    expect(detectBusinessSignals('المنتجات الأكثر ارجاعا').map((signal) => signal.category)).toContain('returns');
    expect(detectBusinessSignals('مخزون منخفض').map((signal) => signal.category)).toContain('inventory');
    expect(detectBusinessSignals('اريد قائمة بالموردين').map((signal) => signal.category)).toContain(
      'suppliers',
    );
    expect(detectBusinessSignals('قائمة العملاء').map((signal) => signal.category)).toContain(
      'customers',
    );
  });

  it('discovers the real supplier master entity from the metadata cache', () => {
    if (!cache) return;
    const result = resolveBusinessEntities(cache, 'اريد قائمة بالموردين');
    const sets = new MetadataCatalog(cache)
      .search('اريد قائمة بالموردين', 25)
      .map((item) => item.entitySet);
    expect(result.signals.map((signal) => signal.category)).toContain('suppliers');
    expect(sets.some((set) => /^Vendors/i.test(set))).toBe(true);
  });

  it('does not add a sales domain to a returns ranking question', () => {
    const categories = detectBusinessSignals('products with increased returns').map((signal) => signal.category);
    expect(categories).toContain('returns');
    expect(categories).not.toContain('sales');
  });

  it('returns no signals for a greeting', () => {
    expect(detectBusinessSignals('Hello')).toEqual([]);
  });

  describe('with the real metadata cache', () => {
    it.skipIf(!cache)('finds verified sales and returns fact candidates', () => {
      if (!cache) return;
      const sales = resolveBusinessEntities(cache, 'HDMI sales', { limit: 8 });
      expect(sales.candidates.length).toBeGreaterThan(0);
      expect(sales.candidates.some((candidate) => /salesinvoiceline|salesorderline/i.test(candidate.entitySet))).toBe(true);

      const returns = resolveBusinessEntities(cache, 'most returned product', { limit: 8 });
      expect(returns.candidates.some((candidate) => /returnorderline|rma/i.test(candidate.entitySet))).toBe(true);
    });

    it.skipIf(!cache)('finds inventory candidates for Arabic stock questions', () => {
      if (!cache) return;
      const result = resolveBusinessEntities(cache, 'مخزون منخفض', { limit: 8 });
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates.some((candidate) => /onhand|inventory/i.test(candidate.entitySet))).toBe(true);
    });
  });
});
