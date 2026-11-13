import { describe, expect, it, vi } from 'vitest';
import { DashboardService } from '../src/dashboard/service';

function createRecordsService(rows: Array<Record<string, unknown>>) {
  const entity = {
    entitySet: 'CustomersV3',
    properties: [
      { name: 'CustomerAccount', type: 'Edm.String' },
      { name: 'OrganizationName', type: 'Edm.String' },
    ],
  };
  const queryBuilder = {
    validate: vi.fn(async (spec: { select?: string[] }) => ({
      entity,
      select: spec.select ?? [],
      params: {},
      orderBy: [],
      top: 25,
      skip: 0,
      expand: [],
      includeCount: true,
      notes: [],
      autoSelected: false,
      clamped: false,
    })),
    toScanParams: vi.fn(() => ({})),
  };
  const client = {
    fetchAllPages: vi.fn(async () => ({
      rows,
      pages: 1,
      complete: true,
      recordsScanned: rows.length,
      totalMatches: rows.length,
    })),
  };
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() };
  const service = new DashboardService({
    analytics: {} as never,
    queryBuilder: queryBuilder as never,
    client: client as never,
    metadata: { getEntity: vi.fn(async () => entity) } as never,
    logger: logger as never,
    searchMaxRows: 500,
    searchPageSize: 100,
  });
  return { service, client };
}

const ROWS = [
  { CustomerAccount: 'C001', OrganizationName: 'Alpha Trading' },
  { CustomerAccount: 'C002', OrganizationName: 'Beta Supplies' },
  { CustomerAccount: 'C003', OrganizationName: 'Gamma Retail' },
];

describe('DashboardService records search', () => {
  it('matches several scanned values in one exact search', async () => {
    const { service } = createRecordsService(ROWS);

    const result = await service.records('customers', { search: 'C001, C003', scan: true });

    expect(result.records.map((row) => row.CustomerAccount)).toEqual(['C001', 'C003']);
    expect(result.total).toBe(2);
  });

  it('matches several text values across code and name fields', async () => {
    const { service } = createRecordsService(ROWS);

    const result = await service.records('customers', { search: 'beta; C003' });

    expect(result.records.map((row) => row.CustomerAccount)).toEqual(['C002', 'C003']);
  });

  it('uses the last segment of a scanned URL as a search value', async () => {
    const { service } = createRecordsService(ROWS);

    const result = await service.records('customers', {
      search: 'https://example.test/customers/C002',
      scan: true,
    });

    expect(result.records.map((row) => row.CustomerAccount)).toEqual(['C002']);
  });

  it('rejects an empty scan search', async () => {
    const { service } = createRecordsService(ROWS);

    await expect(service.records('customers', { search: ' , ; ', scan: true })).rejects.toThrow(
      /scanned code is required/i,
    );
  });
});
