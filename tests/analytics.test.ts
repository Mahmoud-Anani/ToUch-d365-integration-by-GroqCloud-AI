import { describe, expect, it, vi } from 'vitest';
import { AnalyticsEngine, type AnalyticsRequest } from '../src/analytics/analytics';
import type { D365Client, PageScan } from '../src/d365/client';
import { ValidationError } from '../src/errors';
import { MetadataService } from '../src/metadata/service';
import { QueryBuilder } from '../src/query/builder';
import { abortError, catalogData, TEST_BASE_URL, testConfig } from './helpers';

interface FakeClient {
  client: D365Client;
  count: ReturnType<typeof vi.fn>;
  fetchAllPages: ReturnType<typeof vi.fn>;
}

function fakeClient(options: {
  count?: number | undefined;
  counts?: Array<number | undefined>;
  scan?: PageScan;
  scans?: PageScan[];
  onCount?: (entitySet: string, filter: string | undefined) => number | undefined;
}): FakeClient {
  const count = vi.fn(async (entitySet: string, filter?: string) => {
    if (options.onCount) return options.onCount(entitySet, filter);
    if (options.counts) return options.counts.shift();
    return options.count;
  });
  const scans = options.scans ? [...options.scans] : [];
  const fetchAllPages = vi.fn(async () =>
    scans.length > 0
      ? (scans.shift() as PageScan)
      : (options.scan ?? { rows: [], complete: true, scanned: 0, pages: 0, totalMatches: 0 }),
  );
  return {
    client: { count, fetchAllPages } as unknown as D365Client,
    count,
    fetchAllPages,
  };
}

function engine(client: D365Client, env: Record<string, string | undefined> = {}): AnalyticsEngine {
  const config = testConfig(env);
  const metadata = new MetadataService(client, {
    cacheTtlMs: 60_000,
    cacheDir: `${TEST_BASE_URL}/nonexistent-cache`,
    maxBytes: 1024,
    baseUrl: TEST_BASE_URL,
    initialCatalog: catalogData(),
  });
  return new AnalyticsEngine(client, metadata, new QueryBuilder(metadata, config), config);
}

function scan(rows: Record<string, unknown>[], overrides: Partial<PageScan> = {}): PageScan {
  return {
    rows,
    complete: true,
    scanned: rows.length,
    pages: 1,
    totalMatches: rows.length,
    ...overrides,
  };
}

describe('AnalyticsEngine.count', () => {
  it('uses the exact server count without scanning records', async () => {
    const fake = fakeClient({ count: 17 });
    const result = await engine(fake.client).run({
      operation: 'count',
      entityName: 'CustomersV3',
      filter: 'IsActive eq true',
    });

    expect(result).toMatchObject({
      operation: 'count',
      entitySet: 'CustomersV3',
      count: 17,
      value: 17,
      complete: true,
      method: 'server-count',
      recordsScanned: 0,
      totalMatches: 17,
    });
    expect(fake.fetchAllPages).not.toHaveBeenCalled();
    expect(fake.count).toHaveBeenCalledWith('CustomersV3', 'IsActive eq true', undefined);
  });

  it('explains that a zero count is a real empty result', async () => {
    const fake = fakeClient({ count: 0 });
    const result = await engine(fake.client).run({ operation: 'count', entityName: 'CustomersV3' });

    expect(result.count).toBe(0);
    expect(result.complete).toBe(true);
    expect(result.notes.join(' ')).toContain('real zero-result');
  });

  it('falls back to a bounded scan when the server omits the count', async () => {
    const fake = fakeClient({
      count: undefined,
      scan: scan([{ a: 1 }, { a: 2 }], { complete: true, totalMatches: undefined }),
    });
    const result = await engine(fake.client).run({ operation: 'count', entityName: 'CustomersV3' });

    expect(result).toMatchObject({ method: 'scan', count: 2, complete: true, recordsScanned: 2 });
    expect(fake.fetchAllPages).toHaveBeenCalledTimes(1);
  });

  it('marks a capped scan as partial', async () => {
    const fake = fakeClient({
      count: undefined,
      scan: scan([{ a: 1 }, { a: 2 }], {
        complete: false,
        totalMatches: 100,
        scanned: 2,
      }),
    });
    const result = await engine(fake.client, { D365_ANALYTICS_MAX_ROWS: '2' }).run({
      operation: 'count',
      entityName: 'CustomersV3',
    });

    expect(result.complete).toBe(false);
    expect(result.notes.join(' ')).toContain('partial');
    expect(result.notes.join(' ')).toContain('must not be reported as a complete total');
  });

  it('rejects an unknown entity', async () => {
    const fake = fakeClient({ count: 1 });
    await expect(
      engine(fake.client).run({ operation: 'count', entityName: 'DoesNotExist' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an unknown filter field through the query builder', async () => {
    const fake = fakeClient({ count: 1 });
    await expect(
      engine(fake.client).run({
        operation: 'count',
        entityName: 'CustomersV3',
        filter: "NotAField eq 'x'",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('AnalyticsEngine single aggregates', () => {
  it('sums numeric values, ignores numeric strings that do not parse, and counts nulls', async () => {
    const fake = fakeClient({
      scan: scan([
        { CreditLimit: 100 },
        { CreditLimit: '50.5' },
        { CreditLimit: null },
        { CreditLimit: '' },
        { CreditLimit: 'not-a-number' },
      ]),
    });
    const result = await engine(fake.client).run({
      operation: 'sum',
      entityName: 'CustomersV3',
      field: 'CreditLimit',
    });

    expect(result).toMatchObject({
      operation: 'sum',
      field: 'CreditLimit',
      value: 150.5,
      recordsScanned: 5,
      recordsUsed: 2,
      nullOrMissing: 3,
      complete: true,
    });
  });

  it('returns 0 for an empty sum and null for an empty average', async () => {
    const fake = fakeClient({ scan: scan([]) });
    const sum = await engine(fake.client).run({
      operation: 'sum',
      entityName: 'CustomersV3',
      field: 'CreditLimit',
    });
    const average = await engine(fake.client).run({
      operation: 'average',
      entityName: 'CustomersV3',
      field: 'CreditLimit',
    });
    expect(sum.value).toBe(0);
    expect(average.value).toBeNull();
  });

  it('averages only numeric values', async () => {
    const fake = fakeClient({
      scan: scan([{ CreditLimit: 10 }, { CreditLimit: 20 }, { CreditLimit: null }]),
    });
    const result = await engine(fake.client).run({
      operation: 'average',
      entityName: 'CustomersV3',
      field: 'CreditLimit',
    });
    expect(result.value).toBe(15);
    expect(result.nullOrMissing).toBe(1);
  });

  it('computes min and max over strings', async () => {
    const fake = fakeClient({
      scan: scan([
        { OrganizationName: 'Zeta' },
        { OrganizationName: 'Alpha' },
        { OrganizationName: '' },
      ]),
    });
    const min = await engine(fake.client).run({
      operation: 'min',
      entityName: 'CustomersV3',
      field: 'OrganizationName',
    });
    const max = await engine(fake.client).run({
      operation: 'max',
      entityName: 'CustomersV3',
      field: 'OrganizationName',
    });
    expect(min.value).toBe('Alpha');
    expect(max.value).toBe('Zeta');
    expect(min.nullOrMissing).toBe(1);
  });

  it('accepts aggregateField as an alias for field', async () => {
    const fake = fakeClient({ scan: scan([{ CreditLimit: 7 }]) });
    const result = await engine(fake.client).run({
      operation: 'max',
      entityName: 'CustomersV3',
      aggregateField: 'CreditLimit',
    });
    expect(result.field).toBe('CreditLimit');
    expect(result.value).toBe(7);
  });

  it('requires a field for sum', async () => {
    const fake = fakeClient({ count: 0 });
    await expect(
      engine(fake.client).run({ operation: 'sum', entityName: 'CustomersV3' }),
    ).rejects.toThrow(/requires a field/);
  });

  it('rejects summing a non-numeric field', async () => {
    const fake = fakeClient({ count: 0 });
    await expect(
      engine(fake.client).run({
        operation: 'sum',
        entityName: 'CustomersV3',
        field: 'OrganizationName',
      }),
    ).rejects.toThrow(/not numeric/);
  });

  it('rejects aggregating a binary field', async () => {
    const fake = fakeClient({ count: 0 });
    await expect(
      engine(fake.client).run({
        operation: 'min',
        entityName: 'CustomersV3',
        field: 'Logo',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a field that does not exist', async () => {
    const fake = fakeClient({ count: 0 });
    await expect(
      engine(fake.client).run({
        operation: 'max',
        entityName: 'CustomersV3',
        field: 'Nope',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('surfaces partial scans for single aggregates', async () => {
    const fake = fakeClient({
      scan: scan([{ CreditLimit: 5 }], { complete: false, totalMatches: 50 }),
    });
    const result = await engine(fake.client, { D365_ANALYTICS_MAX_ROWS: '1' }).run({
      operation: 'sum',
      entityName: 'CustomersV3',
      field: 'CreditLimit',
    });
    expect(result.complete).toBe(false);
    expect(result.totalMatches).toBe(50);
    expect(result.notes.join(' ')).toContain('partial');
  });

  it('resolves the entity type from an EntityType name', async () => {
    const fake = fakeClient({ scan: scan([{ CreditLimit: 1 }]) });
    const result = await engine(fake.client).run({
      operation: 'sum',
      entityName: 'CustomerV3',
      field: 'CreditLimit',
    });
    expect(result.entitySet).toBe('CustomersV3');
  });

  it('propagates caller cancellation', async () => {
    const fake = fakeClient({ count: 1 });
    fake.fetchAllPages.mockRejectedValueOnce(abortError());
    await expect(
      engine(fake.client).run(
        { operation: 'sum', entityName: 'CustomersV3', field: 'CreditLimit' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('AnalyticsEngine.groupBy', () => {
  const rows = [
    { CustomerGroupId: '10', CreditLimit: 10 },
    { CustomerGroupId: '10', CreditLimit: 20 },
    { CustomerGroupId: '20', CreditLimit: 5 },
    { CustomerGroupId: null, CreditLimit: null },
  ];

  it('counts rows per group, including a blank bucket', async () => {
    const fake = fakeClient({ scan: scan(rows) });
    const result = await engine(fake.client).run({
      operation: 'groupBy',
      entityName: 'CustomersV3',
      groupByField: 'CustomerGroupId',
    });

    expect(result.operation).toBe('groupBy');
    expect(result.aggregateOperation).toBe('count');
    expect(result.groupCount).toBe(3);
    expect(result.groups).toEqual([
      { key: '10', count: 2, value: 2 },
      { key: '(blank)', count: 1, value: 1 },
      { key: '20', count: 1, value: 1 },
    ]);
    expect(result.groupsTruncated).toBe(false);
  });

  it('sums a numeric field per group', async () => {
    const fake = fakeClient({ scan: scan(rows) });
    const result = await engine(fake.client).run({
      operation: 'groupBy',
      entityName: 'CustomersV3',
      groupByField: 'CustomerGroupId',
      aggregateOperation: 'sum',
      aggregateField: 'CreditLimit',
    });

    const byKey = Object.fromEntries((result.groups ?? []).map((group) => [group.key, group.value]));
    expect(byKey['10']).toBe(30);
    expect(byKey['20']).toBe(5);
    expect(byKey['(blank)']).toBe(0);
    expect(result.nullOrMissing).toBe(1);
  });

  it('averages a numeric field per group and returns null for all-null groups', async () => {
    const fake = fakeClient({ scan: scan(rows) });
    const result = await engine(fake.client).run({
      operation: 'groupBy',
      entityName: 'CustomersV3',
      groupByField: 'CustomerGroupId',
      aggregateOperation: 'average',
      aggregateField: 'CreditLimit',
    });

    const byKey = Object.fromEntries((result.groups ?? []).map((group) => [group.key, group.value]));
    expect(byKey['10']).toBe(15);
    expect(byKey['20']).toBe(5);
    expect(byKey['(blank)']).toBeNull();
  });

  it('truncates groups to maxGroups and flags the truncation', async () => {
    const fake = fakeClient({
      scan: scan([
        { CustomerGroupId: 'a' },
        { CustomerGroupId: 'b' },
        { CustomerGroupId: 'c' },
        { CustomerGroupId: 'd' },
      ]),
    });
    const result = await engine(fake.client, { AI_MAX_GROUPS: '2' }).run({
      operation: 'groupBy',
      entityName: 'CustomersV3',
      groupByField: 'CustomerGroupId',
    });

    expect(result.groups).toHaveLength(2);
    expect(result.groupCount).toBe(4);
    expect(result.groupsTruncated).toBe(true);
    expect(result.notes.join(' ')).toContain('top 2 of 4 groups');
  });

  it('requires groupByField', async () => {
    const fake = fakeClient({ count: 0 });
    await expect(
      engine(fake.client).run({ operation: 'groupBy', entityName: 'CustomersV3' }),
    ).rejects.toThrow(/groupByField/);
  });

  it('requires aggregateField for non-count aggregates', async () => {
    const fake = fakeClient({ count: 0 });
    await expect(
      engine(fake.client).run({
        operation: 'groupBy',
        entityName: 'CustomersV3',
        groupByField: 'CustomerGroupId',
        aggregateOperation: 'sum',
      }),
    ).rejects.toThrow(/aggregateField/);
  });

  it('rejects an unsupported aggregate operation', async () => {
    const fake = fakeClient({ count: 0 });
    await expect(
      engine(fake.client).run({
        operation: 'groupBy',
        entityName: 'CustomersV3',
        groupByField: 'CustomerGroupId',
        aggregateOperation: 'median' as never,
      }),
    ).rejects.toThrow(/Unsupported groupBy aggregate/);
  });

  it('rejects a non-numeric sum aggregate', async () => {
    const fake = fakeClient({ count: 0 });
    await expect(
      engine(fake.client).run({
        operation: 'groupBy',
        entityName: 'CustomersV3',
        groupByField: 'CustomerGroupId',
        aggregateOperation: 'sum',
        aggregateField: 'OrganizationName',
      }),
    ).rejects.toThrow(/must be numeric/);
  });

  it('rejects an unknown group field', async () => {
    const fake = fakeClient({ count: 0 });
    await expect(
      engine(fake.client).run({
        operation: 'groupBy',
        entityName: 'CustomersV3',
        groupByField: 'Nope',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('notes partial scans in grouped results', async () => {
    const fake = fakeClient({
      scan: scan([{ CustomerGroupId: 'a' }], { complete: false, totalMatches: 99 }),
    });
    const result = await engine(fake.client, { D365_ANALYTICS_MAX_ROWS: '1' }).run({
      operation: 'groupBy',
      entityName: 'CustomersV3',
      groupByField: 'CustomerGroupId',
    });
    expect(result.complete).toBe(false);
    expect(result.notes.join(' ')).toContain('partial');
  });
});

describe('AnalyticsEngine.comparison', () => {
  it('compares two exact counts and computes the difference', async () => {
    const fake = fakeClient({
      onCount: (_entity, filter) => (filter?.includes('true') ? 10 : 4),
    });
    const result = await engine(fake.client).run({
      operation: 'comparison',
      entityName: 'CustomersV3',
      leftFilter: 'IsActive eq true',
      rightFilter: 'IsActive eq false',
      leftLabel: 'Active',
      rightLabel: 'Inactive',
    });

    expect(result.operation).toBe('comparison');
    expect(result.complete).toBe(true);
    expect(result.method).toBe('server-count');
    expect(result.comparison?.left).toMatchObject({ label: 'Active', count: 10 });
    expect(result.comparison?.right).toMatchObject({ label: 'Inactive', count: 4 });
    expect(result.comparison?.difference).toBe(6);
    expect(result.comparison?.percentageDifference).toBe(150);
    expect(result.notes).toEqual([]);
  });

  it('uses default labels and a null percentage when the right side is zero', async () => {
    const fake = fakeClient({ counts: [5, 0] });
    const result = await engine(fake.client).run({
      operation: 'comparison',
      entityName: 'CustomersV3',
    });
    expect(result.comparison?.left.label).toBe('A');
    expect(result.comparison?.right.label).toBe('B');
    expect(result.comparison?.difference).toBe(5);
    expect(result.comparison?.percentageDifference).toBeNull();
  });

  it('compares sums of a numeric field', async () => {
    const fake = fakeClient({
      count: undefined,
      scans: [
        scan([{ CreditLimit: 10 }, { CreditLimit: 20 }]),
        scan([{ CreditLimit: 5 }]),
      ],
    });
    const result = await engine(fake.client).run({
      operation: 'comparison',
      entityName: 'CustomersV3',
      field: 'CreditLimit',
      aggregateOperation: 'sum',
      leftFilter: 'IsActive eq true',
      rightFilter: 'IsActive eq false',
    });

    expect(result.comparison?.left.value).toBe(30);
    expect(result.comparison?.right.value).toBe(5);
    expect(result.comparison?.difference).toBe(25);
    expect(result.method).toBe('scan');
  });

  it('marks the comparison partial when one side is incomplete', async () => {
    const fake = fakeClient({
      counts: [10, undefined],
      scans: [scan([{ a: 1 }], { complete: false, totalMatches: 50 })],
    });
    const result = await engine(fake.client).run({
      operation: 'comparison',
      entityName: 'CustomersV3',
    });
    expect(result.complete).toBe(false);
    expect(result.notes.join(' ')).toContain('must not be presented as complete');
  });

  it('rejects a non-count comparison without a field', async () => {
    const fake = fakeClient({ count: 0 });
    await expect(
      engine(fake.client).run({
        operation: 'comparison',
        entityName: 'CustomersV3',
        aggregateOperation: 'sum',
      }),
    ).rejects.toThrow(/requires field/);
  });

  it('rejects an unsupported comparison aggregate', async () => {
    const fake = fakeClient({ count: 0 });
    await expect(
      engine(fake.client).run({
        operation: 'comparison',
        entityName: 'CustomersV3',
        aggregateOperation: 'mode' as never,
      }),
    ).rejects.toThrow(/Unsupported comparison aggregate/);
  });
});

describe('AnalyticsEngine.run dispatch', () => {
  it('requires an operation', async () => {
    const fake = fakeClient({ count: 0 });
    await expect(
      engine(fake.client).run({ entityName: 'CustomersV3' } as AnalyticsRequest),
    ).rejects.toThrow(/operation is required/);
  });
});
