import { describe, expect, it, vi } from 'vitest';
import { DashboardService } from '../src/dashboard/service';
import { D365Error } from '../src/errors';

function createService(run: (request: { entityName: string }) => unknown) {
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
    expect(analysis.breakdowns).toHaveLength(31);
    for (const breakdown of analysis.breakdowns) {
      expect(['bar', 'donut', 'column']).toContain(breakdown.chart);
      expect(breakdown.status).toBe('ok');
    }
    expect(analysis.breakdowns.map((b) => b.chart)).toContain('donut');
    expect(analysis.breakdowns.map((b) => b.chart)).toContain('column');

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
    expect(analysis.breakdowns.filter((b) => b.status === 'ok')).toHaveLength(28);
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
});
