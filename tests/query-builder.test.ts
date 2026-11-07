import { describe, expect, it, vi } from 'vitest';
import type { MetadataService } from '../src/metadata/service';
import { MetadataCatalog } from '../src/metadata/catalog';
import { matchesPattern, QueryBuilder, type QuerySpec } from '../src/query/builder';
import { catalogData, testConfig } from './helpers';

const catalog = new MetadataCatalog(catalogData());
const metadata = {
  getEntity: vi.fn(async (name: string) => catalog.getEntity(name)),
} as unknown as MetadataService;

function builder(overrides: Record<string, string | undefined> = {}): QueryBuilder {
  return new QueryBuilder(metadata, testConfig(overrides));
}

const validate = (spec: QuerySpec, overrides: Record<string, string | undefined> = {}) =>
  builder(overrides).validate(spec);

describe('QueryBuilder selection', () => {
  it('auto-selects keys plus safe fields and records a note', async () => {
    const query = await validate({ entityName: 'SalesOrderHeadersV2' });
    expect(query.autoSelected).toBe(true);
    expect(query.select.slice(0, 2)).toEqual(['dataAreaId', 'SalesOrderNumber']);
    expect(query.select).toHaveLength(8);
    expect(query.notes.join(' ')).toMatch(/auto-selected/);
    expect(query.params.$select).toBe(query.select.join(','));
    expect(query.params.$top).toBe('25');
    expect(query.params.$count).toBe('true');
  });

  it('never auto-selects binary or policy-denied fields', async () => {
    const customers = await validate({ entityName: 'CustomersV3' });
    expect(customers.select).not.toContain('Logo');
    expect(customers.select).toContain('Notes');

    const denied = await validate(
      { entityName: 'CustomersV3' },
      { D365_FIELD_DENYLIST: 'Notes,Logo' },
    );
    expect(denied.select).not.toContain('Notes');
    expect(denied.select).not.toContain('Logo');
  });

  it('honours a field allowlist for auto-selection and explicit selection', async () => {
    const allowlist = 'dataAreaId,SalesOrderNumber,TotalAmount';
    const query = await validate({ entityName: 'SalesOrderHeadersV2' }, {
      D365_FIELD_ALLOWLIST: allowlist,
    });
    expect(query.select).toEqual(['dataAreaId', 'SalesOrderNumber', 'TotalAmount']);
    await expect(
      validate({ entityName: 'SalesOrderHeadersV2', select: ['Notes'] }, {
        D365_FIELD_ALLOWLIST: allowlist,
      }),
    ).rejects.toThrow(/not allowed by data policy/);
  });

  it('canonicalises explicit fields, adds missing keys and deduplicates', async () => {
    const query = await validate({
      entityName: 'SalesOrderHeadersV2',
      select: ['salesordernumber', 'TOTALAMOUNT', 'totalamount'],
    });
    expect(query.select).toEqual(['SalesOrderNumber', 'TotalAmount', 'dataAreaId']);
    expect(query.autoSelected).toBe(false);
  });

  it('rejects unknown and non-queryable fields', async () => {
    await expect(
      validate({ entityName: 'SalesOrderHeadersV2', select: ['DoesNotExist'] }),
    ).rejects.toThrow(/does not exist/);
    await expect(
      validate({ entityName: 'CustomersV3', select: ['Logo'] }),
    ).rejects.toThrow(/not queryable/);
  });

  it('notes and caps overly long select lists', async () => {
    const select = Array.from({ length: 30 }, (_, index) =>
      index % 2 === 0 ? 'SalesOrderNumber' : 'TotalAmount',
    );
    const query = await validate({ entityName: 'SalesOrderHeadersV2', select });
    expect(query.notes.join(' ')).toMatch(/limited to 25 fields/);
    expect(query.select.length).toBeLessThanOrEqual(25);
  });
});

describe('QueryBuilder policy', () => {
  it('enforces entity allowlists and denylists by EntitySet or EntityType', async () => {
    await expect(validate({ entityName: 'CustomersV3' }, { D365_ENTITY_DENYLIST: '*V3' })).rejects.toThrow(
      /blocked by policy/,
    );
    await expect(
      validate({ entityName: 'CustomersV3' }, { D365_ENTITY_DENYLIST: 'CustomerV3' }),
    ).rejects.toThrow(/blocked by policy/);
    await expect(
      validate({ entityName: 'SalesOrderHeadersV2' }, { D365_ENTITY_ALLOWLIST: 'Customers*' }),
    ).rejects.toThrow(/not allowed by policy/);
    await expect(
      validate({ entityName: 'CustomersV3' }, { D365_ENTITY_ALLOWLIST: 'Customers*' }),
    ).resolves.toBeDefined();
  });

  it('rejects entities that are advertised without field metadata', async () => {
    await expect(validate({ entityName: 'AdvertisedOnlyEntity' })).rejects.toThrow(
      /no field metadata/,
    );
  });

  it('rejects unknown entities with a schema-discovery hint', async () => {
    await expect(validate({ entityName: 'NoSuchSet' })).rejects.toThrow(/searchEntities/);
  });
});

describe('QueryBuilder parameters and limits', () => {
  it('validates and canonicalises filters', async () => {
    const query = await validate({
      entityName: 'SalesOrderHeadersV2',
      filter: "salesorderstatus eq 'Open' and totalamount gt 1000",
    });
    expect(query.filter).toBe("(SalesOrderStatus eq 'Open' and TotalAmount gt 1000)");
    expect(query.params.$filter).toBe(query.filter);
  });

  it('defaults top to 25 but clamps to the configured maximum', async () => {
    const clamped = await validate({ entityName: 'SalesOrderHeadersV2', top: 500 }, {
      AI_MAX_RESULT_ROWS: '40',
    });
    expect(clamped.top).toBe(40);
    expect(clamped.clamped).toBe(true);
    expect(clamped.notes.join(' ')).toMatch(/limited to the configured maximum of 40/);

    const tiny = await validate({ entityName: 'SalesOrderHeadersV2', top: 0 });
    expect(tiny.top).toBe(1);
  });

  it('validates skip and caps it at 100000', async () => {
    const skipped = await validate({ entityName: 'SalesOrderHeadersV2', skip: 200_000 });
    expect(skipped.skip).toBe(100_000);
    expect(skipped.params.$skip).toBe('100000');
    expect(skipped.clamped).toBe(true);

    const negative = await validate({ entityName: 'SalesOrderHeadersV2', skip: -5 });
    expect(negative.skip).toBe(0);
    expect(negative.params.$skip).toBeUndefined();
  });

  it('parses orderBy strings, arrays and duplicates', async () => {
    const query = await validate({
      entityName: 'SalesOrderHeadersV2',
      orderBy: 'totalamount desc, orderdate',
    });
    expect(query.orderBy).toEqual([
      { field: 'TotalAmount', direction: 'desc' },
      { field: 'OrderDate', direction: 'asc' },
    ]);
    expect(query.params.$orderby).toBe('TotalAmount desc,OrderDate asc');

    const array = await validate({
      entityName: 'SalesOrderHeadersV2',
      orderBy: ['SalesOrderNumber', 'TotalAmount DESC'],
    });
    expect(array.params.$orderby).toBe('SalesOrderNumber asc,TotalAmount desc');

    const duplicate = await validate({
      entityName: 'SalesOrderHeadersV2',
      orderBy: ['TotalAmount asc', 'totalamount desc'],
    });
    expect(duplicate.orderBy).toEqual([{ field: 'TotalAmount', direction: 'asc' }]);
  });

  it('rejects malformed or unauthorised orderBy clauses', async () => {
    await expect(
      validate({ entityName: 'SalesOrderHeadersV2', orderBy: 'TotalAmount descending' }),
    ).rejects.toThrow(/Invalid orderBy/);
    await expect(
      validate({ entityName: 'SalesOrderHeadersV2', orderBy: 'Nope asc' }),
    ).rejects.toThrow(/does not exist/);
    await expect(
      validate({ entityName: 'SalesOrderHeadersV2', orderBy: 'Notes asc' }, {
        D365_FIELD_DENYLIST: 'Notes',
      }),
    ).rejects.toThrow(/blocked by data policy/);
  });

  it('validates expand against real navigation properties', async () => {
    const query = await validate({
      entityName: 'SalesOrderHeadersV2',
      expand: ['customer', 'LINES'],
    });
    expect(query.expand).toEqual(['Customer', 'Lines']);
    expect(query.params.$expand).toBe('Customer,Lines');

    await expect(
      validate({ entityName: 'SalesOrderHeadersV2', expand: ['Missing'] }),
    ).rejects.toThrow(/does not exist/);
    await expect(
      validate({ entityName: 'SalesOrderHeadersV2', expand: ['Customer', 'Lines', 'Other'] }),
    ).rejects.toThrow(/At most two/);
  });

  it('omits count when configured and supports scan parameters', async () => {
    const query = await validate(
      { entityName: 'SalesOrderHeadersV2', top: 10, skip: 5, includeCount: false },
      { D365_INCLUDE_COUNT: 'false' },
    );
    expect(query.params.$count).toBeUndefined();
    expect(query.includeCount).toBe(false);

    const scan = builder().toScanParams(query);
    expect(scan).toEqual({ $select: query.select.join(','), $count: 'true' });
    expect(scan.$top).toBeUndefined();
    expect(scan.$skip).toBeUndefined();
  });
});

describe('matchesPattern', () => {
  it('matches exact and wildcard patterns case-insensitively', () => {
    expect(matchesPattern('CustomersV3', ['customersv3'])).toBe(true);
    expect(matchesPattern('CustomersV3', ['Customers*'])).toBe(true);
    expect(matchesPattern('CustomersV3', ['*V3'])).toBe(true);
    expect(matchesPattern('CustomersV3', ['*customers*v3*'])).toBe(true);
    expect(matchesPattern('CustomersV3', ['Sales*'])).toBe(false);
    expect(matchesPattern('CustomersV3', [])).toBe(false);
    expect(matchesPattern('CustomersV3', ['  '])).toBe(false);
    expect(matchesPattern('a.b', ['a.b'])).toBe(true);
    expect(matchesPattern('axb', ['a.b'])).toBe(false);
  });
});
