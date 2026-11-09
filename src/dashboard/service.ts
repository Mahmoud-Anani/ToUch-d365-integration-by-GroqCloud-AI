import type { AnalyticsEngine } from '../analytics/analytics';
import type { D365Client } from '../d365/client';
import type { Logger } from '../logger';
import type { MetadataService } from '../metadata/service';
import { propertyKind, type PropertyKind } from '../metadata/types';
import type { QueryBuilder } from '../query/builder';
import { NotFoundError, toPublicError, ValidationError } from '../errors';
import {
  DASHBOARD_MODULES,
  findDashboardModule,
  type DashboardModule,
  type LocalizedText,
  type ModuleCategory,
} from './modules';

export interface ModuleSummary {
  id: string;
  entitySet: string;
  title: LocalizedText;
  description: LocalizedText;
  category: ModuleCategory;
  featured: boolean;
  count: number | null;
  status: 'ok' | 'unavailable';
  error?: string;
}

export interface DashboardOverview {
  generatedAt: string;
  readOnly: true;
  modules: ModuleSummary[];
  availableModules: number;
  totalModules: number;
}

export interface AnalysisGroup {
  key: string;
  count: number;
  value?: number | string | null;
}

export interface AnalysisBreakdown {
  id: string;
  title: LocalizedText;
  entitySet: string;
  groupByField: string;
  status: 'ok' | 'unavailable';
  groups: AnalysisGroup[];
  groupCount: number;
  complete: boolean;
  recordsScanned: number;
  totalMatches?: number;
  error?: string;
}

export interface DashboardAnalysis {
  generatedAt: string;
  readOnly: true;
  breakdowns: AnalysisBreakdown[];
}

export interface ModuleRecords {
  module: {
    id: string;
    entitySet: string;
    title: LocalizedText;
    description: LocalizedText;
  };
  columns: Array<{ name: string; kind: PropertyKind }>;
  records: Array<Record<string, unknown>>;
  total: number | null;
  top: number;
  skip: number;
  hasMore: boolean;
  generatedAt: string;
}

interface BreakdownDefinition {
  id: string;
  title: LocalizedText;
  entityName: string;
  groupByField: string;
}

const BREAKDOWNS: readonly BreakdownDefinition[] = [
  {
    id: 'products-by-type',
    title: { en: 'Products by type', ar: 'المنتجات حسب النوع' },
    entityName: 'ReleasedProductsV2',
    groupByField: 'ProductType',
  },
  {
    id: 'customers-by-group',
    title: { en: 'Customers by group', ar: 'العملاء حسب المجموعة' },
    entityName: 'CustomersV3',
    groupByField: 'CustomerGroupId',
  },
  {
    id: 'vendors-by-group',
    title: { en: 'Vendors by group', ar: 'الموردون حسب المجموعة' },
    entityName: 'VendorsV2',
    groupByField: 'VendorGroupId',
  },
  {
    id: 'invoices-by-status',
    title: { en: 'Invoices by posting status', ar: 'الفواتير حسب حالة الترحيل' },
    entityName: 'FreeTextInvoiceHeaders',
    groupByField: 'IsPosted',
  },
];

const MAX_GROUP_ROWS = 12;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 120;
const MAX_SKIP = 100_000;
const OVERVIEW_CACHE_MS = 15_000;

function safeMessage(error: unknown): string {
  return toPublicError(error).body.error.message;
}

export interface DashboardServiceOptions {
  analytics: AnalyticsEngine;
  queryBuilder: QueryBuilder;
  client: D365Client;
  metadata: MetadataService;
  logger: Logger;
  /** Maximum rows scanned per searched record query (safety bound, like analytics). */
  searchMaxRows: number;
  /** OData page size used to scan rows for searched record queries. */
  searchPageSize: number;
}

export class DashboardService {
  private readonly options: DashboardServiceOptions;
  private overviewCache?: { value: DashboardOverview; expiresAt: number };

  constructor(options: DashboardServiceOptions) {
    this.options = options;
  }

  listModules(): DashboardModule[] {
    return [...DASHBOARD_MODULES];
  }

  async overview(options: { force?: boolean } = {}): Promise<DashboardOverview> {
    const now = Date.now();
    if (!options.force && this.overviewCache && this.overviewCache.expiresAt > now) {
      return this.overviewCache.value;
    }

    const modules = await Promise.all(
      DASHBOARD_MODULES.map(async (module): Promise<ModuleSummary> => {
        const base = {
          id: module.id,
          entitySet: module.entitySet,
          title: module.title,
          description: module.description,
          category: module.category,
          featured: module.featured === true,
        };
        try {
          const result = await this.options.analytics.run({
            operation: 'count',
            entityName: module.entitySet,
          });
          const count = typeof result.value === 'number' ? result.value : result.count ?? null;
          return { ...base, count, status: 'ok' };
        } catch (error) {
          const message = safeMessage(error);
          this.options.logger.warn('Dashboard module count failed', {
            module: module.id,
            entitySet: module.entitySet,
            code: toPublicError(error).body.error.code,
          });
          return { ...base, count: null, status: 'unavailable', error: message };
        }
      }),
    );

    const value: DashboardOverview = {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      modules,
      availableModules: modules.filter((module) => module.status === 'ok').length,
      totalModules: modules.length,
    };
    this.overviewCache = { value, expiresAt: now + OVERVIEW_CACHE_MS };
    return value;
  }

  async analysis(): Promise<DashboardAnalysis> {
    const breakdowns = await Promise.all(
      BREAKDOWNS.map(async (definition): Promise<AnalysisBreakdown> => {
        const base = {
          id: definition.id,
          title: definition.title,
          entitySet: definition.entityName,
          groupByField: definition.groupByField,
        };
        try {
          const result = await this.options.analytics.run({
            operation: 'groupBy',
            entityName: definition.entityName,
            groupByField: definition.groupByField,
            aggregateOperation: 'count',
          });
          const groups = (result.groups ?? [])
            .slice()
            .sort((left, right) => right.count - left.count)
            .slice(0, MAX_GROUP_ROWS)
            .map((group) => ({
              key: group.key,
              count: group.count,
              ...(group.value !== undefined ? { value: group.value } : {}),
            }));
          return {
            ...base,
            status: 'ok',
            groups,
            groupCount: result.groupCount ?? result.groups?.length ?? groups.length,
            complete: result.complete,
            recordsScanned: result.recordsScanned,
            ...(result.totalMatches !== undefined ? { totalMatches: result.totalMatches } : {}),
          };
        } catch (error) {
          this.options.logger.warn('Dashboard analysis failed', {
            breakdown: definition.id,
            entitySet: definition.entityName,
            code: toPublicError(error).body.error.code,
          });
          return {
            ...base,
            status: 'unavailable',
            groups: [],
            groupCount: 0,
            complete: false,
            recordsScanned: 0,
            error: safeMessage(error),
          };
        }
      }),
    );

    return {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      breakdowns,
    };
  }

  async records(
    id: string,
    options: { search?: string; top?: number; skip?: number } = {},
  ): Promise<ModuleRecords> {
    const module = findDashboardModule(id);
    if (!module) throw new NotFoundError('Dashboard module was not found.');

    const search = typeof options.search === 'string' ? options.search.trim() : '';
    if (search.length > MAX_SEARCH_LENGTH) {
      throw new ValidationError(`Search text must be at most ${MAX_SEARCH_LENGTH} characters.`);
    }
    if (search && !module.searchField) {
      throw new ValidationError('This module does not support text search.');
    }

    const top = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number.isFinite(options.top) ? Math.trunc(options.top as number) : DEFAULT_PAGE_SIZE),
    );
    const skip = Math.min(
      MAX_SKIP,
      Math.max(0, Number.isFinite(options.skip) ? Math.trunc(options.skip as number) : 0),
    );

    // Tolerate metadata drift: only request fields that the live catalog
    // advertises. Keys are added automatically by the query builder.
    const entity = await this.options.metadata.getEntity(module.entitySet);
    let select = entity
      ? module.fields.filter((field) =>
          entity.properties.some((property) => property.name.toLowerCase() === field.toLowerCase()),
        )
      : module.fields;

    // Live D365 rejects contains()/startswith() with a 400 on these
    // integration-map entities, so searched queries scan a bounded,
    // server-ordered page set and filter in memory. The search field must
    // therefore always be part of the selection.
    if (search && entity && module.searchField) {
      const searchProperty = entity.properties.find(
        (property) => property.name.toLowerCase() === (module.searchField as string).toLowerCase(),
      );
      if (!searchProperty) {
        throw new ValidationError('This module does not support text search.');
      }
      const alreadySelected = select.some(
        (field) => field.toLowerCase() === searchProperty.name.toLowerCase(),
      );
      if (!alreadySelected) select = [...select, searchProperty.name];
    }

    const query = await this.options.queryBuilder.validate({
      entityName: module.entitySet,
      ...(select.length > 0 ? { select } : {}),
      ...(module.orderBy ? { orderBy: module.orderBy } : {}),
      top,
      skip,
      includeCount: true,
    });

    const columns = query.select.map((name) => {
      const property = query.entity.properties.find(
        (item) => item.name.toLowerCase() === name.toLowerCase(),
      );
      return { name, kind: property ? propertyKind(property.type) : 'unknown' };
    });

    if (search && module.searchField) {
      const searchField = module.searchField;
      const scan = await this.options.client.fetchAllPages(
        query.entity.entitySet,
        this.options.queryBuilder.toScanParams(query),
        {
          maxRows: Math.max(1, this.options.searchMaxRows),
          pageSize: Math.max(1, this.options.searchPageSize),
        },
      );
      const needle = search.toLowerCase();
      const filtered = scan.rows.filter((row) =>
        String(row?.[searchField] ?? '')
          .toLowerCase()
          .includes(needle),
      );
      const page = filtered.slice(skip, skip + top);
      return {
        module: {
          id: module.id,
          entitySet: module.entitySet,
          title: module.title,
          description: module.description,
        },
        columns,
        records: page,
        total: filtered.length,
        top,
        skip,
        hasMore: skip + page.length < filtered.length,
        generatedAt: new Date().toISOString(),
      };
    }

    const response = await this.options.client.getEntity<{ value?: unknown }>(
      query.entity.entitySet,
      query.params,
    );
    const rows = Array.isArray(response.data?.value)
      ? (response.data.value as Record<string, unknown>[])
      : [];

    const total = typeof response.count === 'number' ? response.count : null;
    return {
      module: {
        id: module.id,
        entitySet: module.entitySet,
        title: module.title,
        description: module.description,
      },
      columns,
      records: rows,
      total,
      top,
      skip,
      hasMore:
        rows.length > 0 &&
        rows.length === top &&
        (total === null || skip + rows.length < total),
      generatedAt: new Date().toISOString(),
    };
  }
}
