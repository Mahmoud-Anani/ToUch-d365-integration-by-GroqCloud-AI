import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry, type ToolContext } from '../src/ai/tools';
import { AttachmentCollector } from '../src/ai/attachments';
import type { EntityMetadata, EntityProperty } from '../src/metadata/types';
import { testConfig, testLogger } from './helpers';

function prop(name: string, type = 'Edm.String', isKey = false): EntityProperty {
  return { name, type, isKey, nullable: true, isCollection: false };
}

function entity(set: string, properties: EntityProperty[]): EntityMetadata {
  return {
    entitySet: set,
    entityType: `Microsoft.Dynamics.DataEntities.${set}`,
    entityTypeShort: set,
    keys: properties.filter((p) => p.isKey).map((p) => p.name),
    properties,
    navigationProperties: [],
    metadataAvailable: true,
  };
}

const ENTITIES = new Map<string, EntityMetadata>([
  [
    'SalesInvoiceLines',
    entity('SalesInvoiceLines', [
      prop('ProductNumber', 'Edm.String', true),
      prop('ProductName'),
      prop('LineAmount', 'Edm.Decimal'),
      prop('InvoiceDate', 'Edm.DateTimeOffset'),
      prop('CurrencyCode'),
      prop('dataAreaId'),
    ]),
  ],
  [
    'ReturnOrderLines',
    entity('ReturnOrderLines', [
      prop('ItemNumber', 'Edm.String', true),
      prop('ProductName'),
      prop('ReturnSalesQuantity', 'Edm.Decimal'),
      prop('ReturnClosedDate', 'Edm.DateTimeOffset'),
    ]),
  ],
  [
    'CDSReturnInvoiceLines',
    entity('CDSReturnInvoiceLines', [
      prop('ProductNumber', 'Edm.String', true),
      prop('ProductName'),
      prop('LineAmount', 'Edm.Decimal'),
      prop('InvoiceDate', 'Edm.DateTimeOffset'),
      prop('CurrencyCode'),
    ]),
  ],
  [
    'InventoryOnHand',
    entity('InventoryOnHand', [
      prop('ItemNumber', 'Edm.String', true),
      prop('ProductName'),
      prop('OnHandQuantity', 'Edm.Decimal'),
    ]),
  ],
  [
    'ReleasedProducts',
    entity('ReleasedProducts', [
      prop('ItemNumber', 'Edm.String', true),
      prop('ProductName'),
      prop('ProductSearchName'),
    ]),
  ],
  [
    'Vendors',
    entity('Vendors', [
      prop('dataAreaId', 'Edm.String', true),
      prop('VendorAccountNumber', 'Edm.String', true),
      prop('VendorName'),
      prop('VendorSearchName'),
    ]),
  ],
  [
    'VendorsV2',
    entity('VendorsV2', [
      prop('dataAreaId', 'Edm.String', true),
      prop('VendorAccountNumber', 'Edm.String', true),
      prop('VendorOrganizationName'),
      prop('VendorSearchName'),
    ]),
  ],
  [
    'VendorInvoiceHeaders',
    entity('VendorInvoiceHeaders', [
      prop('InvoiceNumber', 'Edm.String', true),
      prop('VendorAccount'),
      prop('InvoiceDate', 'Edm.DateTimeOffset'),
      prop('Amount', 'Edm.Decimal'),
    ]),
  ],
]);

const CANDIDATES: Record<string, Array<{ entitySet: string; categories: string[]; score: number }>> = {
  sales: [{ entitySet: 'SalesInvoiceLines', categories: ['sales', 'products'], score: 40 }],
  products: [{ entitySet: 'ReleasedProducts', categories: ['products'], score: 40 }],
  returns: [
    // This sales-shaped entity has "Return" in its name but no return fields.
    { entitySet: 'CDSReturnInvoiceLines', categories: ['returns'], score: 80 },
    { entitySet: 'ReturnOrderLines', categories: ['returns'], score: 40 },
  ],
  inventory: [{ entitySet: 'InventoryOnHand', categories: ['inventory'], score: 40 }],
  suppliers: [
    { entitySet: 'VendorInvoiceHeaders', categories: ['suppliers', 'purchasing'], score: 80 },
    { entitySet: 'Vendors', categories: ['suppliers'], score: 20 },
    { entitySet: 'VendorsV2', categories: ['suppliers'], score: 18 },
  ],
};

type Row = Record<string, unknown>;

function createRegistry(options: {
  rows: Map<string, Row[]>;
  rejectFiltered?: boolean;
  fail?: boolean;
  config?: Record<string, string | undefined>;
  onFilter?: (filter: string | undefined) => void;
}) {
  const metadata = {
    getCatalog: async () => ({ getEntity: (name: string) => ENTITIES.get(name) }),
    getEntity: async (name: string) => ENTITIES.get(name),
    resolveBusiness: async (question: string) => {
      const normalized = question.toLowerCase();
      const category =
        Object.keys(CANDIDATES).find((key) => normalized.startsWith(key)) ??
        Object.keys(CANDIDATES).find((key) => normalized.includes(key)) ??
        'sales';
      return { candidates: CANDIDATES[category] ?? [], signals: [], notes: [], language: 'en' };
    },
    getSchema: async (name: string) => {
      const found = ENTITIES.get(name);
      return found ? { entity: found, properties: found.properties, navigation: [], truncated: false } : undefined;
    },
  };
  const queryBuilder = {
    validate: (args: { entityName: string; select?: string[]; filter?: string }) => {
      if (options.rejectFiltered && args.filter) {
        throw { details: { upstreamStatus: 400 }, message: 'D365 returned 400' };
      }
      const found = ENTITIES.get(args.entityName);
      return {
        entity: { entitySet: args.entityName, entityType: found?.entityType ?? args.entityName },
        params: { $select: (args.select ?? []).join(','), ...(args.filter ? { $filter: args.filter } : {}) },
        select: args.select ?? [],
      };
    },
  };
  const client = {
    fetchAllPages: async (set: string, params: Record<string, string>) => {
      if (options.fail) throw new Error('ERP offline');
      options.onFilter?.(params.$filter);
      const all = options.rows.get(set) ?? [];
      return { rows: all, scanned: all.length, complete: true };
    },
    getEntity: async (set: string) => ({ data: { value: options.rows.get(set) ?? [] } }),
  };
  return new ToolRegistry(
    metadata as never,
    queryBuilder as never,
    client as never,
    {} as never,
    testConfig({ D365_ANALYTICS_MAX_ROWS: '100', ...(options.config ?? {}) }),
    testLogger().logger,
  );
}

function makeContext(): ToolContext {
  return {
    userId: 'test',
    toolCallId: 'tool-1',
    collector: new AttachmentCollector(),
    emitStatus: vi.fn(),
  };
}

describe('controlled domain tools with mocked ERP data', () => {
  it('publishes a repeated table and data context only once', () => {
    const collector = new AttachmentCollector();
    const attachment = {
      type: 'table' as const,
      id: 'first',
      title: 'Supplier records',
      columns: [{ key: 'Supplier', label: 'Supplier', type: 'string' as const, isKey: true }],
      rows: [{ Supplier: 'V100' }],
      truncated: false,
    };
    const context = {
      entitySet: 'Vendors',
      entityType: 'Vendor',
      operation: 'suppliers_list',
      select: ['VendorAccountNumber'],
      rowsReturned: 1,
      complete: true,
      capturedAt: '2026-01-01T00:00:00Z',
    };
    collector.addAttachment(attachment);
    collector.addAttachment({ ...attachment, id: 'second' });
    collector.addDataContext(context);
    collector.addDataContext({ ...context, capturedAt: '2026-01-02T00:00:00Z' });
    expect(collector.attachments).toHaveLength(1);
    expect(collector.dataContext).toHaveLength(1);
  });

  it('lists supplier master records without a name filter or invoice entity', async () => {
    const rows = new Map<string, Row[]>([
      [
        'Vendors',
        [{ VendorAccountNumber: 'V100', VendorName: 'الحاج حسن', VendorSearchName: 'Al Haj Hassan' }],
      ],
      [
        'VendorInvoiceHeaders',
        [{ InvoiceNumber: 'I100', VendorAccount: 'V100', Amount: 500 }],
      ],
    ]);
    const tools = createRegistry({ rows });
    const context = makeContext();
    const result = await tools.execute(
      'list_business_records',
      { question: 'اريد قائمة بالموردين', category: 'suppliers', limit: 20 },
      context,
    );
    const content = result.content as Record<string, unknown>;
    expect(result.isError).not.toBe(true);
    expect(['Vendors', 'VendorsV2']).toContain(content.entitySet);
    expect(content.rowsReturned).toBe(1);
    expect(JSON.stringify(content.rows)).toContain('الحاج حسن');
    const request = content.request as Record<string, unknown>;
    expect(request.entitySet).toBe(content.entitySet);
    expect(request.filter).toBeUndefined();
    const attachment = context.collector.attachments[0];
    expect(attachment?.type).toBe('table');
    expect(attachment?.type === 'table' ? attachment.rows : []).toHaveLength(1);
  });

  it('resolves product names to codes, then aggregates real sales rows', async () => {
    const rows = new Map<string, Row[]>([
      [
        'ReleasedProducts',
        [
          { ItemNumber: 'A0001', ProductName: 'HDMI 6ft Cable' },
          { ItemNumber: 'A0002', ProductName: 'HDMI 12ft Cable' },
          { ItemNumber: 'D0001', ProductName: 'Speaker' },
        ],
      ],
      [
        'SalesInvoiceLines',
        [
          { ProductNumber: 'A0001 : Default', ProductName: '', LineAmount: 100, InvoiceDate: '2017-01-01T00:00:00Z', CurrencyCode: 'USD' },
          { ProductNumber: 'A0002', ProductName: 'HDMI 12ft Cable', LineAmount: 50, InvoiceDate: '2017-02-01T00:00:00Z', CurrencyCode: 'USD' },
          { ProductNumber: 'D0001', ProductName: 'Speaker', LineAmount: 900, InvoiceDate: '2017-03-01T00:00:00Z', CurrencyCode: 'USD' },
        ],
      ],
    ]);
    const tools = createRegistry({ rows });
    const result = await tools.execute(
      'get_sales_summary',
      { question: 'sales of hdmi', productTerm: 'HDMI', months: 120, topN: 5 },
      makeContext(),
    );
    const content = result.content as Record<string, unknown>;
    expect(result.isError).not.toBe(true);
    expect(content.entitySet).toBe('SalesInvoiceLines');
    expect(content.totalMeasuredValue).toBe(150);
    const top = content.topResults as Array<Record<string, unknown>>;
    expect(top.map((item) => item.key)).toEqual(expect.arrayContaining(['A0001 : Default', 'A0002']));
    expect(top.some((item) => item.label === 'HDMI 6ft Cable')).toBe(true);
    expect((content.topContribution as Record<string, unknown>).percent).toBeCloseTo(100 / 150 * 100, 1);
  });

  it('ranks returns by absolute returned quantity and uses the full population as denominator', async () => {
    const rows = new Map<string, Row[]>([
      ['ReleasedProducts', [{ ItemNumber: 'T0001', ProductName: 'Speaker Cable' }]],
      [
        'ReturnOrderLines',
        [
          { ItemNumber: 'T0001', ProductName: '', ReturnSalesQuantity: -6, ReturnClosedDate: '2017-01-01T00:00:00Z' },
          { ItemNumber: 'T0001', ProductName: '', ReturnSalesQuantity: -6, ReturnClosedDate: '2017-02-01T00:00:00Z' },
          { ItemNumber: 'T0003', ProductName: '', ReturnSalesQuantity: -8, ReturnClosedDate: '2017-03-01T00:00:00Z' },
        ],
      ],
    ]);
    const tools = createRegistry({ rows });
    const result = await tools.execute(
      'get_returns_summary',
      { question: 'most returned product', topN: 1 },
      makeContext(),
    );
    const content = result.content as Record<string, unknown>;
    // A sales-shaped entity with "Return" in its name must never win.
    expect(content.entitySet).toBe('ReturnOrderLines');
    expect(content.totalMeasuredValue).toBe(20);
    const top = (content.topResults as Array<Record<string, unknown>>)[0];
    expect(top).toMatchObject({ key: 'T0001', value: 12, count: 2 });
    expect(top?.label).toBe('Speaker Cable');
    expect((content.topContribution as Record<string, unknown>).percent).toBe(60);
  });

  it('scopes ERP reads to the configured legal entity', async () => {
    const filters: Array<string | undefined> = [];
    const rows = new Map<string, Row[]>([
      [
        'SalesInvoiceLines',
        [
          { ProductNumber: 'A0001', ProductName: 'HDMI Cable', LineAmount: 75, dataAreaId: 'usmf' },
          { ProductNumber: 'A0001', ProductName: 'HDMI Cable', LineAmount: 999, dataAreaId: 'other' },
        ],
      ],
    ]);
    const tools = createRegistry({
      rows,
      config: { D365_DATA_AREA: 'usmf' },
      onFilter: (filter) => filters.push(filter),
    });
    const result = await tools.execute('get_sales_summary', { question: 'sales' }, makeContext());
    const content = result.content as Record<string, unknown>;
    expect(filters).toContain("dataAreaId eq 'usmf'");
    expect(content.totalMeasuredValue).toBe(75);
  });

  it('refuses an unscoped entity when company scoping is configured', async () => {
    const tools = createRegistry({
      rows: new Map(),
      config: { D365_DATA_AREA: 'usmf' },
    });
    const result = await tools.execute('get_inventory_summary', { question: 'low inventory' }, makeContext());
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('cannot be scoped');
  });

  it('marks a bounded local-scan fallback as partial but never reports it as zero', async () => {
    const rows = new Map<string, Row[]>([
      ['ReleasedProducts', [{ ItemNumber: 'A0001', ProductName: 'HDMI Cable' }]],
      [
        'SalesInvoiceLines',
        [
          { ProductNumber: 'A0001', ProductName: 'HDMI Cable', LineAmount: 75, InvoiceDate: '2017-01-01T00:00:00Z', CurrencyCode: 'USD' },
        ],
      ],
    ]);
    const tools = createRegistry({ rows, rejectFiltered: true });
    const result = await tools.execute(
      'get_sales_summary',
      { question: 'hdmi sales', productTerm: 'HDMI', topN: 5 },
      makeContext(),
    );
    const content = result.content as Record<string, unknown>;
    expect(content.totalMeasuredValue).toBe(75);
    expect(content.complete).toBe(false);
    expect(content.serverFiltered).toBe(false);
    expect(content.warnings).toEqual(expect.arrayContaining([expect.stringContaining('bounded scan')]));
  });

  it('distinguishes a genuine no-record result from a failed request', async () => {
    const empty = createRegistry({ rows: new Map(), rejectFiltered: true });
    const emptyResult = await empty.execute('get_returns_summary', { question: 'returns' }, makeContext());
    const emptyContent = emptyResult.content as Record<string, unknown>;
    expect(emptyResult.isError).not.toBe(true);
    expect(emptyContent.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('genuine no-record result')]),
    );

    const failing = createRegistry({ rows: new Map(), fail: true });
    const failedResult = await failing.execute('get_inventory_summary', { question: 'inventory' }, makeContext());
    expect(failedResult.isError).toBe(true);
  });

  it('refuses a zero-denominator metric instead of inventing a percentage', async () => {
    const tools = createRegistry({ rows: new Map() });
    const result = await tools.execute(
      'analyze_business_metrics',
      { metric: 'return_rate', numerator: 5, denominator: 0 },
      makeContext(),
    );
    const content = result.content as Record<string, unknown>;
    expect(content.valid).toBe(false);
    expect(content.percent).toBeNull();
    expect(content.warnings).toEqual(expect.arrayContaining([expect.stringContaining('zero')]));
  });

  it('compares two verified periods with an explicit formula', async () => {
    const previous = [
      { ProductNumber: 'A0001', LineAmount: 100, InvoiceDate: '2016-01-01T00:00:00Z' },
    ];
    const current = [
      { ProductNumber: 'A0001', LineAmount: 150, InvoiceDate: '2017-01-01T00:00:00Z' },
    ];
    const rows = new Map<string, Row[]>([['SalesInvoiceLines', [...previous, ...current]]]);
    const tools = createRegistry({ rows, rejectFiltered: true });
    const result = await tools.execute(
      'compare_business_periods',
      {
        question: 'sales growth',
        category: 'sales',
        previousFrom: '2016-01-01T00:00:00Z',
        previousTo: '2016-06-30T23:59:59Z',
        currentFrom: '2017-01-01T00:00:00Z',
        currentTo: '2017-06-30T23:59:59Z',
      },
      makeContext(),
    );
    const content = result.content as Record<string, unknown>;
    expect((content.previous as Record<string, unknown>).total).toBe(100);
    expect((content.current as Record<string, unknown>).total).toBe(150);
    expect((content.change as Record<string, unknown>).percent).toBe(50);
  });

  it('ranks products whose measured value increased between verified periods', async () => {
    const rows = new Map<string, Row[]>([
      [
        'ReturnOrderLines',
        [
          { ItemNumber: 'A0001', ReturnSalesQuantity: -100, ReturnClosedDate: '2016-01-01T00:00:00Z' },
          { ItemNumber: 'A0002', ReturnSalesQuantity: -80, ReturnClosedDate: '2016-01-01T00:00:00Z' },
          { ItemNumber: 'A0001', ReturnSalesQuantity: -150, ReturnClosedDate: '2017-01-01T00:00:00Z' },
          { ItemNumber: 'A0002', ReturnSalesQuantity: -50, ReturnClosedDate: '2017-01-01T00:00:00Z' },
        ],
      ],
    ]);
    const tools = createRegistry({ rows });
    const context = makeContext();
    const result = await tools.execute(
      'compare_business_periods',
      {
        question: 'which products increased returns',
        category: 'returns',
        previousFrom: '2016-01-01T00:00:00Z',
        previousTo: '2016-06-30T23:59:59Z',
        currentFrom: '2017-01-01T00:00:00Z',
        currentTo: '2017-06-30T23:59:59Z',
      },
      context,
    );
    const content = result.content as Record<string, unknown>;
    const increases = content.increases as Array<Record<string, unknown>>;
    expect(increases).toHaveLength(1);
    expect(increases[0]).toMatchObject({ product: 'A0001', previous: 100, current: 150, amount: 50 });
    expect(context.collector.sources.some((source) => source.operation === 'period_comparison')).toBe(true);
  });

  it('falls back to the two most recent recorded periods when requested periods are empty', async () => {
    const rows = new Map<string, Row[]>([
      [
        'ReturnOrderLines',
        [
          { ItemNumber: 'A0001', ReturnSalesQuantity: -20, ReturnClosedDate: '2016-01-10T00:00:00Z' },
          { ItemNumber: 'A0002', ReturnSalesQuantity: -40, ReturnClosedDate: '2017-01-10T00:00:00Z' },
          { ItemNumber: 'A0002', ReturnSalesQuantity: -60, ReturnClosedDate: '2017-02-10T00:00:00Z' },
        ],
      ],
    ]);
    const tools = createRegistry({ rows });
    const result = await tools.execute(
      'compare_business_periods',
      {
        question: 'which products increased returns compared with the previous period',
        category: 'returns',
        previousFrom: '2026-08-20T00:00:00Z',
        previousTo: '2026-11-19T23:59:59Z',
        currentFrom: '2026-11-20T00:00:00Z',
        currentTo: '2026-12-31T23:59:59Z',
      },
      makeContext(),
    );
    const content = result.content as Record<string, unknown>;
    expect(content.historicalFallback).toBe(true);
    expect(content.previousRange).toEqual({ from: '2017-01-01', to: '2017-01-31' });
    expect(content.currentRange).toEqual({ from: '2017-02-01', to: '2017-02-28' });
    expect((content.previous as Record<string, unknown>).total).toBe(40);
    expect((content.current as Record<string, unknown>).total).toBe(60);
    expect(content.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('most recent recorded periods with data')]),
    );
  });

  it('reports totals without inventing a trend when all historical records share one period', async () => {
    const rows = new Map<string, Row[]>([
      [
        'ReturnOrderLines',
        [
          { ItemNumber: 'T0001', ReturnSalesQuantity: -20, ReturnClosedDate: '1900-01-01T12:00:00Z' },
          { ItemNumber: 'T0002', ReturnSalesQuantity: -40, ReturnClosedDate: '1900-01-01T12:00:00Z' },
        ],
      ],
    ]);
    const tools = createRegistry({ rows });
    const result = await tools.execute(
      'compare_business_periods',
      {
        question: 'which products increased returns compared with the previous period',
        category: 'returns',
        previousFrom: '2026-09-20T00:00:00Z',
        previousTo: '2026-10-19T23:59:59Z',
        currentFrom: '2026-10-20T00:00:00Z',
        currentTo: '2026-11-19T23:59:59Z',
      },
      makeContext(),
    );
    const content = result.content as Record<string, unknown>;
    expect(content.historicalFallback).toBe(true);
    expect(content.comparisonComparable).toBe(false);
    expect((content.productTotals as Array<Record<string, unknown>>)[0]).toMatchObject({
      product: 'T0002',
      value: 40,
    });
    expect(content.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('single recorded period')]),
    );
  });

  it('finds Touch products in product master records, never invoice records', async () => {
    const rows = new Map<string, Row[]>([
      [
        'ReleasedProducts',
        [
          { ItemNumber: 'T0001', ProductName: 'Touchscreen Display' },
          { ItemNumber: 'T0004', ProductName: 'Display Pro', ProductSearchName: 'full touch colour display' },
          { ItemNumber: 'T0002', ProductName: 'Standard Display' },
        ],
      ],
      [
        'SalesInvoiceLines',
        [{ ProductNumber: 'T0001', ProductName: 'Touchscreen Display', LineAmount: 10 }],
      ],
    ]);
    const tools = createRegistry({ rows });
    const result = await tools.execute(
      'search_erp_records',
      {
        question: 'Show me Touch products currently listed in our ERP',
        searchTerm: 'Touch',
        category: 'products',
        limit: 10,
      },
      makeContext(),
    );
    const content = result.content as Record<string, unknown>;
    expect(content.entitySet).toBe('ReleasedProducts');
    expect(content.rowsReturned).toBe(2);
    expect(JSON.stringify(content.rows)).toContain('Touchscreen Display');
    expect(JSON.stringify(content.rows)).toContain('full touch colour display');
    expect(result.meta?.entitySet).toBe('ReleasedProducts');
  });

  it('returns exactly the requested top 10 products by sales', async () => {
    const sales = Array.from({ length: 11 }, (_, index) => ({
      ProductNumber: `P${String(index + 1).padStart(2, '0')}`,
      LineAmount: index + 1,
      InvoiceDate: '2017-01-01T00:00:00Z',
      CurrencyCode: 'USD',
    }));
    const tools = createRegistry({ rows: new Map([['SalesInvoiceLines', sales]]) });
    const result = await tools.execute(
      'get_sales_summary',
      { question: 'what are the top 10 products by sales', topN: 10 },
      makeContext(),
    );
    const content = result.content as Record<string, unknown>;
    expect(content.totalMeasuredValue).toBe(66);
    expect((content.topResults as unknown[])).toHaveLength(10);
    expect(content.topResultCount).toBe(11);
  });

  it('compares return magnitudes across equivalent periods', async () => {
    const rows = new Map<string, Row[]>([
      [
        'ReturnOrderLines',
        [
          { ItemNumber: 'T0001', ReturnSalesQuantity: -4, ReturnClosedDate: '2016-01-10T00:00:00Z' },
          { ItemNumber: 'T0002', ReturnSalesQuantity: -6, ReturnClosedDate: '2016-02-10T00:00:00Z' },
          { ItemNumber: 'T0001', ReturnSalesQuantity: -9, ReturnClosedDate: '2017-01-10T00:00:00Z' },
          { ItemNumber: 'T0002', ReturnSalesQuantity: -11, ReturnClosedDate: '2017-02-10T00:00:00Z' },
        ],
      ],
    ]);
    const tools = createRegistry({ rows, rejectFiltered: true });
    const result = await tools.execute(
      'compare_business_periods',
      {
        question: 'which products increased returns compared with the previous period',
        category: 'returns',
        previousFrom: '2016-01-01T00:00:00Z',
        previousTo: '2016-06-30T23:59:59Z',
        currentFrom: '2017-01-01T00:00:00Z',
        currentTo: '2017-06-30T23:59:59Z',
      },
      makeContext(),
    );
    const content = result.content as Record<string, unknown>;
    expect((content.previous as Record<string, unknown>).total).toBe(10);
    expect((content.current as Record<string, unknown>).total).toBe(20);
    expect((content.change as Record<string, unknown>).percent).toBe(100);
  });

  it('ranks low-stock products by smallest verified on-hand quantity', async () => {
    const rows = new Map<string, Row[]>([
      [
        'InventoryOnHand',
        [
          { ItemNumber: 'A0001', ProductName: 'HDMI Cable', OnHandQuantity: 5 },
          { ItemNumber: 'A0002', ProductName: 'Speaker', OnHandQuantity: 100 },
          { ItemNumber: 'A0003', ProductName: 'Cable', OnHandQuantity: 20 },
        ],
      ],
    ]);
    const tools = createRegistry({ rows });
    const result = await tools.execute(
      'get_inventory_summary',
      { question: 'which products have low inventory compared with sales', topN: 3 },
      makeContext(),
    );
    const content = result.content as Record<string, unknown>;
    expect((content.topResults as Array<Record<string, unknown>>).map((item) => item.key)).toEqual([
      'A0001',
      'A0003',
      'A0002',
    ]);
    expect(content.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('point-in-time snapshot'),
      ]),
    );
  });

  it('warns when verified rows mix currencies instead of combining them silently', async () => {
    const rows = new Map<string, Row[]>([
      [
        'SalesInvoiceLines',
        [
          { ProductNumber: 'A0001', LineAmount: 100, InvoiceDate: '2017-01-01T00:00:00Z', CurrencyCode: 'USD' },
          { ProductNumber: 'A0002', LineAmount: 100, InvoiceDate: '2017-01-01T00:00:00Z', CurrencyCode: 'EUR' },
        ],
      ],
    ]);
    const tools = createRegistry({ rows });
    const result = await tools.execute(
      'get_sales_summary',
      { question: 'top products by sales', topN: 5 },
      makeContext(),
    );
    const content = result.content as Record<string, unknown>;
    expect(content.warnings).toEqual(expect.arrayContaining([expect.stringContaining('currency')]));
  });

  it('rejects unknown tools and unsupported metrics', async () => {
    const tools = createRegistry({ rows: new Map() });
    const unknown = await tools.execute('drop_database', {}, makeContext());
    expect(unknown.isError).toBe(true);
    expect(JSON.stringify(unknown.content)).toContain('UNKNOWN_TOOL');

    const badMetric = await tools.execute(
      'analyze_business_metrics',
      { metric: 'invented_metric', numerator: 1, denominator: 2 },
      makeContext(),
    );
    expect(badMetric.isError).toBe(true);
  });
});
