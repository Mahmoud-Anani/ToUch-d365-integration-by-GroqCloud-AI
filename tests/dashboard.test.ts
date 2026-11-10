import { describe, expect, it, vi } from 'vitest';
import { DashboardService } from '../src/dashboard/service';
import { D365Error } from '../src/errors';

function createService(
  run: (request: {
    entityName?: string;
    operation?: string;
    filter?: string;
    groupByField?: string;
  }) => unknown,
) {
  const { logger } = (() => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() };
    return { logger };
  })();
  return new DashboardService({
    analytics: { run: vi.fn(run) } as never,
    queryBuilder: {} as never,
    client: {} as never,
    metadata: {} as never,
    logger: logger as never,
    searchMaxRows: 500,
    searchPageSize: 100,
  });
}

function groupResult(groups: Array<{ key: string; count: number }>) {
  return {
    groups: groups.map((group) => ({ key: group.key, count: group.count })),
    groupCount: groups.length,
    complete: true,
    recordsScanned: groups.reduce((sum, group) => sum + group.count, 0),
    totalMatches: groups.reduce((sum, group) => sum + group.count, 0),
  };
}

describe('DashboardService.analysis', () => {
  it('serves every breakdown with a chart type and per-group share', async () => {
    const service = createService((request) => {
      if (request.entityName === 'CustomersV3') {
        return groupResult([
          { key: '30', count: 16 },
          { key: '10', count: 10 },
          { key: '90', count: 6 },
        ]);
      }
      return groupResult([{ key: 'A', count: 3 }]);
    });

    const analysis = await service.analysis();
    expect(analysis.breakdowns).toHaveLength(35);
    for (const breakdown of analysis.breakdowns) {
      expect(['bar', 'donut', 'column']).toContain(breakdown.chart);
      expect(['decision', 'analysis']).toContain(breakdown.section);
      expect(breakdown.status).toBe('ok');
    }
    expect(analysis.breakdowns.map((b) => b.chart)).toContain('donut');
    expect(analysis.breakdowns.map((b) => b.chart)).toContain('column');

    // Sales-vs-returns decision cards live in the decision section.
    const decision = analysis.breakdowns.filter((b) => b.section === 'decision');
    expect(decision.map((b) => b.id)).toContain('returns-by-reason');
    expect(decision.map((b) => b.id)).toContain('returns-by-customer');
    expect(decision.map((b) => b.id)).toContain('returns-by-status');
    expect(decision.map((b) => b.id)).toContain('sales-orders-by-status');

    const customers = analysis.breakdowns.find((b) => b.id === 'customers-by-group');
    expect(customers?.groups[0]).toMatchObject({ key: '30', count: 16, share: 0.5 });
    expect(customers?.groups[1]?.share).toBeCloseTo(10 / 32, 4);
    expect(customers?.groupCount).toBe(3);
  });

  it('keeps entities distinct and degrades gracefully on failure', async () => {
    const service = createService((request) => {
      if (request.entityName === 'ExchangeRates') {
        throw new D365Error({ publicMessage: 'D365 offline for test.', message: 'D365 offline' });
      }
      return groupResult([{ key: 'X', count: 1 }]);
    });

    const analysis = await service.analysis();
    const failed = analysis.breakdowns.find((b) => b.id === 'rates-by-type');
    expect(failed?.status).toBe('unavailable');
    expect(failed?.groups).toEqual([]);
    expect(failed?.error).toContain('D365 offline');
    expect(analysis.breakdowns.filter((b) => b.status === 'ok')).toHaveLength(32);
  });

  it('never runs more than five breakdown scans concurrently', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const service = createService(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight -= 1;
      return groupResult([{ key: 'X', count: 1 }]);
    });

    await service.analysis();
    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('computes the sales-vs-returns decision metric from both counts', async () => {
    const service = createService((request) => {
      if (request.operation === 'count') {
        return {
          value: request.entityName === 'SalesOrderHeadersV4' ? 200 : 10,
          complete: true,
        };
      }
      return groupResult([{ key: 'A', count: 1 }]);
    });

    const analysis = await service.analysis();
    expect(analysis.salesVsReturns).toMatchObject({
      status: 'ok',
      salesEntitySet: 'SalesOrderHeadersV4',
      returnEntitySet: 'ReturnOrderHeadersV2',
      salesCount: 200,
      returnCount: 10,
      returnRate: 0.05,
      salesComplete: true,
      returnsComplete: true,
    });
  });

  it('degrades the decision metric when one side fails', async () => {
    const service = createService((request) => {
      if (request.operation === 'count') {
        if (request.entityName === 'SalesOrderHeadersV4') {
          throw new D365Error({ publicMessage: 'Sales offline.', message: 'Sales offline' });
        }
        return { value: 10, complete: true };
      }
      return groupResult([{ key: 'A', count: 1 }]);
    });

    const analysis = await service.analysis();
    expect(analysis.salesVsReturns).toMatchObject({
      status: 'partial',
      salesCount: null,
      returnCount: 10,
      returnRate: null,
      returnsComplete: true,
    });
    expect(analysis.salesVsReturns.error).toContain('Sales offline');
  });

  it('weights value-aggregate breakdowns by value, not count', async () => {
    const service = createService((request) => {
      if (request.entityName === 'ReturnOrderHeadersV2' && request.groupByField === 'CustomerReturnReasonCode') {
        return {
          groups: [
            { key: 'QUALITY', count: 2, value: 500 },
            { key: 'LATE', count: 9, value: 100 },
            { key: 'DAMAGE', count: 1, value: 300 },
          ],
          groupCount: 3,
          complete: true,
          recordsScanned: 12,
        };
      }
      return groupResult([{ key: 'A', count: 1 }]);
    });

    const analysis = await service.analysis();
    const byReason = analysis.breakdowns.find((b) => b.id === 'returns-by-reason');
    expect(byReason?.aggregate).toEqual({ operation: 'sum', field: 'OrderTotalAmount' });
    expect(byReason?.groups.map((group) => group.key)).toEqual(['QUALITY', 'DAMAGE', 'LATE']);
    expect(byReason?.groups[0]?.share).toBeCloseTo(500 / 900, 4);
    expect(byReason?.groups[0]?.value).toBe(500);
  });
});

describe('DashboardService.drilldown', () => {
  it('re-queries a group filtered by its key and grouped by the drill field', async () => {
    const run = vi.fn(async (request: { filter?: string }) => {
      if (request.filter) {
        expect(request.filter).toBe("CustomerReturnReasonCode eq 'QUALITY'");
        return groupResult([
          { key: 'C-0001', count: 3 },
          { key: 'C-0002', count: 1 },
        ]);
      }
      return groupResult([{ key: 'QUALITY', count: 4 }]);
    });
    const service = createService(run);

    const result = await service.drilldown('returns-by-reason', 'QUALITY');
    expect(result.status).toBe('ok');
    expect(result.drillKey).toBe('QUALITY');
    expect(result.parentGroupByField).toBe('CustomerReturnReasonCode');
    expect(result.groupByField).toBe('CustomerAccountNumber');
    expect(result.groups[0]).toMatchObject({ key: 'C-0001', count: 3, share: 0.75 });
  });

  it('escapes apostrophes in group keys before they reach the query builder', async () => {
    const run = vi.fn(async (request: { filter?: string }) => {
      if (request.filter) return groupResult([]);
      return groupResult([{ key: "O'Brien", count: 2 }]);
    });
    const service = createService(run);

    await service.drilldown('returns-by-customer', "O'Brien");
    expect(run).toHaveBeenLastCalledWith(
      expect.objectContaining({ filter: "CustomerAccountNumber eq 'O''Brien'" }),
    );
  });

  it('maps blank groups to an IS NULL filter', async () => {
    const run = vi.fn(async (request: { filter?: string }) => {
      if (request.filter) return groupResult([]);
      return groupResult([{ key: '(blank)', count: 2 }]);
    });
    const service = createService(run);

    await service.drilldown('returns-by-customer', '(blank)');
    expect(run).toHaveBeenLastCalledWith(
      expect.objectContaining({ filter: "(CustomerAccountNumber eq null or CustomerAccountNumber eq '')" }),
    );
  });

  it('rejects unknown and non-drillable breakdowns', async () => {
    const service = createService(() => groupResult([{ key: 'X', count: 1 }]));

    await expect(service.drilldown('not-a-breakdown', 'x')).rejects.toThrow(
      'Dashboard breakdown was not found.',
    );
    await expect(service.drilldown('customers-by-group', 'x')).rejects.toThrow(
      'does not support drill-down',
    );
    await expect(service.drilldown('returns-by-reason', '   ')).rejects.toThrow(
      'group key is required',
    );
  });
});
