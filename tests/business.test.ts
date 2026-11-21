import { describe, expect, it } from 'vitest';
import { formatBusinessContext, friendlyLabel, toModelEvidence } from '../src/ai/business';
import type { DataContextEntry } from '../src/ai/attachments';
import { buildSystemPrompt } from '../src/ai/prompt';
import { publicStatus, status } from '../src/ai/status';

describe('business evidence boundary', () => {
  it('defines a decision-brief answer contract', () => {
    const prompt = buildSystemPrompt({
      locale: 'en',
      maxContextChars: 1_000,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(prompt).toMatch(/Lead with the decision/);
    expect(prompt).toMatch(/concrete next action/);
    expect(prompt).toMatch(/STRICTLY PROHIBITED/);
  });

  it('turns query results into business records without ERP identifiers', () => {
    const evidence = toModelEvidence('queryEntity', {
      entitySet: 'CustomersV3',
      entityType: 'CustomerV3',
      select: ['CustomerAccount', 'dataAreaId'],
      filter: 'PartyType eq "Person"',
      orderBy: 'CustomerAccount asc',
      totalMatches: 12,
      rowsReturned: 5,
      complete: false,
      notes: ['Only 5 of 12 matching row(s) were returned.'],
      rows: [{ CustomerAccount: 'C-100', dataAreaId: 'USMF' }],
    }) as Record<string, unknown>;

    const json = JSON.stringify(evidence);
    expect(json).not.toMatch(/CustomersV3|CustomerV3|dataAreaId|PartyType|orderBy|filter|select/i);
    expect(evidence).toMatchObject({
      resultCount: 12,
      returnedCount: 5,
      complete: false,
      records: [{ Customer: 'C-100', Company: 'USMF' }],
    });
    expect(json).toContain('Only 5 of 12 matching record(s) were returned.');
  });

  it('keeps calculation values but removes technical operation metadata', () => {
    const evidence = toModelEvidence('analyzeData', {
      operation: 'groupBy',
      entitySet: 'CustomersV3',
      entityType: 'CustomerV3',
      field: 'CustomerAccount',
      groupByField: 'SalesTaxGroup',
      filter: 'dataAreaId eq "USMF"',
      value: null,
      count: 12,
      complete: true,
      groups: [{ key: 'Tax exempt', count: 7, value: 7 }],
      notes: [],
    }) as Record<string, unknown>;

    const json = JSON.stringify(evidence);
    expect(json).not.toMatch(/CustomersV3|CustomerV3|CustomerAccount|SalesTaxGroup|dataAreaId|groupBy/i);
    expect(evidence).toMatchObject({
      measure: 'Breakdown',
      count: 12,
      complete: true,
      breakdown: [{ label: 'Tax exempt', count: 7, value: 7 }],
    });
  });

  it('converts tool errors into business-language problems', () => {
    const evidence = toModelEvidence('queryEntity', {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Field "BogusField" does not exist on entity "CustomersV3".',
      },
    }) as Record<string, unknown>;

    expect(JSON.stringify(evidence)).not.toMatch(/BogusField|CustomersV3|VALIDATION_ERROR/i);
    expect(evidence.problem).toMatch(/not available in the requested form/i);
  });

  it('keeps internal routing private while exposing only match counts', () => {
    const evidence = toModelEvidence('searchEntities', {
      searchTerm: 'customers',
      resultCount: 1,
      results: [{ entitySet: 'CustomersV3', entityType: 'CustomerV3', description: 'Customers' }],
      hint: 'Entity names and matched property names are actual D365 metadata.',
    }) as Record<string, unknown>;

    expect(evidence.matchCount).toBe(1);
    expect((evidence._internalRouting as unknown[])[0]).toMatchObject({ entitySet: 'CustomersV3' });
    expect(evidence._internalNote).toMatch(/private/i);
  });

  it('formats conversation memory without entity, field or filter names', () => {
    const entry: DataContextEntry = {
      entitySet: 'CustomersV3',
      entityType: 'CustomerV3',
      operation: 'query',
      select: ['CustomerAccount'],
      filter: 'dataAreaId eq "USMF"',
      rowsReturned: 3,
      complete: true,
      capturedAt: '2026-01-01T00:00:00.000Z',
      sampleRows: [{ CustomerAccount: 'C-100', dataAreaId: 'USMF' }],
    };

    const context = formatBusinessContext([entry], 2_500);
    expect(context).not.toMatch(/CustomersV3|CustomerV3|dataAreaId|CustomerAccount|filter|select/i);
    expect(context).toContain('"Customer":"C-100"');
    expect(context).toContain('"Company":"USMF"');
  });

  it('humanizes common and camel-case labels', () => {
    expect(friendlyLabel('CustomerAccount')).toBe('Customer');
    expect(friendlyLabel('dataAreaId')).toBe('Company');
    expect(friendlyLabel('TotalAmount')).toBe('Total amount');
  });

  it('keeps business-domain discovery evidence free of source identifiers', () => {
    const evidence = toModelEvidence('search_erp_entities', {
      searchTerm: 'مبيعات',
      detectedBusinessAreas: [{ area: 'sales', confidence: 0.95 }],
      candidates: [
        {
          entitySet: 'SalesInvoiceV3Lines',
          entityType: 'Microsoft.Dynamics.DataEntities.SalesInvoiceV3Line',
          entityTypeShort: 'SalesInvoiceV3Line',
          categories: ['sales', 'products'],
          confidence: 0.9,
        },
      ],
    }) as Record<string, unknown>;

    const json = JSON.stringify(evidence);
    expect(json).not.toMatch(/SalesInvoiceV3Lines|SalesInvoiceV3Line|entitySet|entityType|\$filter/i);
    expect(evidence).toMatchObject({
      detectedBusinessAreas: [{ area: 'sales', confidence: 0.95 }],
      availableDataSources: [{ businessCategories: ['sales', 'products'] }],
    });
  });

  it('converts entity metadata into business detail labels only', () => {
    const evidence = toModelEvidence('get_entity_metadata', {
      entitySet: 'ReleasedProducts',
      entityType: 'Microsoft.Dynamics.DataEntities.ReleasedProduct',
      keys: ['ItemNumber'],
      properties: [
        { name: 'ItemNumber', type: 'Edm.String', isKey: true },
        { name: 'ProductName', type: 'Edm.String', isKey: false },
      ],
      relationships: [{ name: 'InventDim' }],
    }) as Record<string, unknown>;

    const json = JSON.stringify(evidence);
    expect(json).not.toMatch(/ReleasedProducts|ReleasedProduct|ItemNumber|ProductName|InventDim|Edm\./i);
    expect(evidence).toMatchObject({
      availableDetails: ['Product', 'Product name'],
      keyDetailCount: 1,
      relationshipCount: 1,
    });
  });

  it('keeps deterministic summaries but removes evidence internals', () => {
    const evidence = toModelEvidence('get_sales_summary', {
      businessArea: 'sales',
      period: 'last 6 months',
      entitySet: 'BundleSalesInvoiceLines',
      fieldsUsed: { name: 'ItemNumber', measure: 'LineAmount' },
      filter: "ItemNumber eq 'A0001'",
      recordsScanned: 5000,
      recordsUsed: 3,
      complete: false,
      totalMeasuredValue: 150,
      topResults: [
        { key: 'A0001', label: "HDMI 6' Cables", value: 100, count: 2 },
      ],
      topResultCount: 2,
      topContribution: { percent: 66.7, formula: '(100 / 150) × 100', valid: true },
      warnings: [
        'Analysis covers last 6 months.',
        'Only a bounded portion of matching records was scanned; figures must be described as partial.',
      ],
    }) as Record<string, unknown>;

    const json = JSON.stringify(evidence);
    expect(json).not.toMatch(
      /BundleSalesInvoiceLines|ItemNumber|LineAmount|fieldsUsed|entitySet|filter|eq 'A0001'/i,
    );
    expect(evidence).toMatchObject({
      businessArea: 'sales',
      total: 150,
      recordsUsed: 3,
      dataStatus: 'partial',
      leaders: [{ product: "HDMI 6' Cables", value: 100, count: 2 }],
      topShare: 66.7,
    });
    expect(JSON.stringify(evidence)).toContain('bounded portion');
  });

  it('keeps period comparison and metric results business-only', () => {
    const comparison = toModelEvidence('compare_business_periods', {
      businessArea: 'returns',
      entitySet: 'CDSReturnOrderLines',
      filter: "dataAreaId eq 'usmf'",
      previous: { total: 10, records: 2 },
      current: { total: 20, records: 4 },
      change: { amount: 10, percent: 100, valid: true },
      warnings: ['Analysis covers 2026-01-01 to 2026-06-30.'],
    }) as Record<string, unknown>;
    expect(JSON.stringify(comparison)).not.toMatch(/CDSReturnOrderLines|dataAreaId|eq 'usmf'|filter/i);
    expect(comparison).toMatchObject({
      previousPeriod: { total: 10, records: 2 },
      currentPeriod: { total: 20, records: 4 },
      change: { amount: 10, percent: 100, valid: true },
    });

    const metric = toModelEvidence('analyze_business_metrics', {
      metric: 'return_rate',
      entitySet: 'ReturnOrderLines',
      percent: null,
      valid: false,
      warnings: ['The denominator is zero; no percentage was calculated.'],
    }) as Record<string, unknown>;
    expect(JSON.stringify(metric)).not.toMatch(/ReturnOrderLines|entitySet/i);
    expect(metric.valid).toBe(false);
    expect(metric.percent).toBeNull();
  });

  it('streams only generic progress fields to the browser', () => {
    const update = status('querying_d365', {
      tool: 'get_sales_summary',
      entitySet: 'BundleSalesInvoiceLines',
      detail: "filter: ItemNumber eq 'A0001'",
    });
    expect(publicStatus(update)).toEqual({
      phase: 'querying_d365',
      label: 'Retrieving business data',
      at: update.at,
    });
  });
});
