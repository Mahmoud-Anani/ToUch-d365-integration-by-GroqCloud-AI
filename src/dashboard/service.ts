import type { AnalyticsEngine, AnalyticsResult, GroupResult } from '../analytics/analytics';
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

export type AnalysisChartType = 'bar' | 'donut' | 'column';

/** Which dashboard section a breakdown is rendered into. */
export type BreakdownSection = 'decision' | 'analysis';

export interface AnalysisGroup {
  key: string;
  count: number;
  /** Share of the breakdown total, 0–1. Weighted by value when the breakdown aggregates one. */
  share: number;
  value?: number | string | null;
}

export interface AnalysisAggregate {
  operation: 'sum' | 'average' | 'min' | 'max';
  field: string;
}

export interface AnalysisBreakdown {
  id: string;
  title: LocalizedText;
  entitySet: string;
  groupByField: string;
  chart: AnalysisChartType;
  section: BreakdownSection;
  status: 'ok' | 'unavailable';
  groups: AnalysisGroup[];
  groupCount: number;
  complete: boolean;
  recordsScanned: number;
  totalMatches?: number;
  /** Value aggregate computed per group, when the definition has one. */
  aggregate?: AnalysisAggregate;
  /** When set, the client can drill into a group by this field. */
  drillGroupByField?: string;
  /** Present on drill-down responses: the group that was expanded. */
  drillKey?: string;
  parentGroupByField?: string;
  error?: string;
}

/**
 * Sales-vs-returns ratio used by the decision-support card. Both sides are
 * counted independently and degrade independently.
 */
export interface SalesVsReturns {
  status: 'ok' | 'partial' | 'unavailable';
  salesEntitySet: string;
  returnEntitySet: string;
  salesCount: number | null;
  returnCount: number | null;
  /** Returns ÷ sales orders, 0–1; null when it cannot be computed. */
  returnRate: number | null;
  salesComplete: boolean;
  returnsComplete: boolean;
  error?: string;
}

export interface DashboardAnalysis {
  generatedAt: string;
  readOnly: true;
  breakdowns: AnalysisBreakdown[];
  salesVsReturns: SalesVsReturns;
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
  chart: AnalysisChartType;
  /** Dashboard section the card is rendered into. Defaults to 'analysis'. */
  section?: BreakdownSection;
  /** Optional value aggregate (e.g. total amount) shown per group. */
  aggregateOperation?: AnalysisAggregate['operation'];
  aggregateField?: string;
  /** When set, clicking a group re-queries grouped by this field. */
  drillGroupByField?: string;
}

/**
 * D365 data-analysis breakdowns. Every entry is a live, deterministic
 * groupBy count over a real integration-map entity; each card degrades
 * independently when its entity is unavailable.
 */
const BREAKDOWNS: readonly BreakdownDefinition[] = [
  // Decision Support: Sales vs Returns
  {
    id: 'returns-by-reason',
    title: { en: 'Returns by reason (order value)', ar: 'المرتجعات حسب السبب (قيمة الأمر)' },
    entityName: 'ReturnOrderHeadersV2',
    groupByField: 'CustomerReturnReasonCode',
    chart: 'bar',
    section: 'decision',
    aggregateOperation: 'sum',
    aggregateField: 'OrderTotalAmount',
    drillGroupByField: 'CustomerAccountNumber',
  },
  {
    id: 'returns-by-customer',
    title: { en: 'Top customers by returns', ar: 'الأعلى في المرتجعات' },
    entityName: 'ReturnOrderHeadersV2',
    groupByField: 'CustomerAccountNumber',
    chart: 'bar',
    section: 'decision',
    drillGroupByField: 'CustomerReturnReasonCode',
  },
  {
    id: 'returns-by-status',
    title: { en: 'Return orders by status', ar: 'أوامر المرتجع حسب الحالة' },
    entityName: 'ReturnOrderHeadersV2',
    groupByField: 'ReturnStatus',
    chart: 'donut',
    section: 'decision',
    drillGroupByField: 'CustomerReturnReasonCode',
  },
  {
    id: 'sales-orders-by-status',
    title: { en: 'Sales orders by status', ar: 'أوامر البيع حسب الحالة' },
    entityName: 'SalesOrderHeadersV4',
    groupByField: 'SalesOrderStatus',
    chart: 'column',
    section: 'decision',
    drillGroupByField: 'InvoiceCustomerAccountNumber',
  },
  // Product & Inventory Analytics
  {
    id: 'products-by-type',
    title: { en: 'Products by type', ar: 'المنتجات حسب النوع' },
    entityName: 'ReleasedProductsV2',
    groupByField: 'ProductType',
    chart: 'bar',
  },
  {
    id: 'products-by-data-area',
    title: { en: 'Products by company', ar: 'المنتجات حسب الشركة' },
    entityName: 'ReleasedProductsV2',
    groupByField: 'dataAreaId',
    chart: 'column',
  },

  // Customer Analytics
  {
    id: 'customers-by-group',
    title: { en: 'Customers by group', ar: 'العملاء حسب المجموعة' },
    entityName: 'CustomersV3',
    groupByField: 'CustomerGroupId',
    chart: 'bar',
  },
  {
    id: 'customers-by-currency',
    title: { en: 'Customers by currency', ar: 'العملاء حسب عملة البيع' },
    entityName: 'CustomersV3',
    groupByField: 'SalesCurrencyCode',
    chart: 'donut',
  },
  {
    id: 'customers-on-hold',
    title: { en: 'Customers on hold', ar: 'العملاء حسب حالة الإيقاف' },
    entityName: 'CustomersV3',
    groupByField: 'OnHoldStatus',
    chart: 'donut',
  },
  {
    id: 'customers-by-company',
    title: { en: 'Customers by company', ar: 'العملاء حسب الشركة' },
    entityName: 'CustomersV3',
    groupByField: 'dataAreaId',
    chart: 'column',
  },

  // Vendor Analytics
  {
    id: 'vendors-by-group',
    title: { en: 'Vendors by group', ar: 'الموردون حسب المجموعة' },
    entityName: 'VendorsV2',
    groupByField: 'VendorGroupId',
    chart: 'bar',
  },
  {
    id: 'vendors-by-currency',
    title: { en: 'Vendors by currency', ar: 'الموردون حسب العملة' },
    entityName: 'VendorsV2',
    groupByField: 'CurrencyCode',
    chart: 'donut',
  },
  {
    id: 'vendors-by-company',
    title: { en: 'Vendors by company', ar: 'الموردون حسب الشركة' },
    entityName: 'VendorsV2',
    groupByField: 'dataAreaId',
    chart: 'column',
  },

  // Financial Transaction Analytics
  {
    id: 'invoices-by-status',
    title: { en: 'Invoices by posting status', ar: 'الفواتير حسب حالة الترحيل' },
    entityName: 'FreeTextInvoiceHeaders',
    groupByField: 'IsPosted',
    chart: 'bar',
  },
  {
    id: 'invoices-by-customer',
    title: { en: 'Top invoice customers', ar: 'أكثر العملاء فواتير' },
    entityName: 'FreeTextInvoiceHeaders',
    groupByField: 'CustomerAccount',
    chart: 'bar',
  },
  {
    id: 'ledger-by-posted',
    title: { en: 'Ledger journals by posting status', ar: 'يوميات دفتر الأستاذ حسب الترحيل' },
    entityName: 'LedgerJournalHeaders',
    groupByField: 'IsPosted',
    chart: 'bar',
  },
  {
    id: 'ledger-by-name',
    title: { en: 'Ledger journals by name', ar: 'يوميات دفتر الأستاذ حسب الاسم' },
    entityName: 'LedgerJournalHeaders',
    groupByField: 'JournalName',
    chart: 'column',
  },
  {
    id: 'ledger-by-currency',
    title: { en: 'Ledger journals by currency', ar: 'يوميات دفتر الأستاذ حسب العملة' },
    entityName: 'LedgerJournalHeaders',
    groupByField: 'AccountingCurrency',
    chart: 'donut',
  },
  {
    id: 'customer-payments-by-status',
    title: { en: 'Customer payments by posting status', ar: 'مدفوعات العملاء حسب الترحيل' },
    entityName: 'CustomerPaymentJournalHeaders',
    groupByField: 'IsPosted',
    chart: 'bar',
  },
  {
    id: 'customer-payments-by-name',
    title: { en: 'Customer payments by journal name', ar: 'مدفوعات العملاء حسب اسم اليومية' },
    entityName: 'CustomerPaymentJournalHeaders',
    groupByField: 'JournalName',
    chart: 'column',
  },
  {
    id: 'expense-journals-by-status',
    title: { en: 'Expense journals by posting status', ar: 'يوميات المصروفات حسب الترحيل' },
    entityName: 'ExpenseJournalHeaders',
    groupByField: 'IsPosted',
    chart: 'bar',
  },
  {
    id: 'expense-journals-by-approver',
    title: { en: 'Expense journals by approver', ar: 'يوميات المصروفات حسب المعتمد' },
    entityName: 'ExpenseJournalHeaders',
    groupByField: 'ApprovedBy',
    chart: 'column',
  },

  // Account & Dimension Analytics
  {
    id: 'accounts-by-type',
    title: { en: 'Main accounts by type', ar: 'الحسابات الرئيسية حسب النوع' },
    entityName: 'MainAccounts',
    groupByField: 'MainAccountType',
    chart: 'column',
  },
  {
    id: 'accounts-by-currency',
    title: { en: 'Main accounts by currency', ar: 'الحسابات الرئيسية حسب العملة' },
    entityName: 'MainAccounts',
    groupByField: 'DefaultCurrency',
    chart: 'donut',
  },
  {
    id: 'accounts-by-suspension',
    title: { en: 'Main accounts suspension status', ar: 'حالة إيقاف الحسابات الرئيسية' },
    entityName: 'MainAccounts',
    groupByField: 'IsSuspended',
    chart: 'donut',
  },
  {
    id: 'dimensions-by-entity',
    title: { en: 'Financial dimensions by entity', ar: 'الأبعاد المالية حسب الكيان' },
    entityName: 'FinancialDimensionValues',
    groupByField: 'LegalEntityId',
    chart: 'bar',
  },
  {
    id: 'dimensions-by-type',
    title: { en: 'Financial dimensions by type', ar: 'الأبعاد المالية حسب النوع' },
    entityName: 'FinancialDimensionValues',
    groupByField: 'FinancialDimension',
    chart: 'column',
  },
  {
    id: 'dimensions-by-suspension',
    title: { en: 'Financial dimensions suspension status', ar: 'حالة إيقاف الأبعاد المالية' },
    entityName: 'FinancialDimensionValues',
    groupByField: 'IsSuspended',
    chart: 'donut',
  },

  // Exchange Rate & Currency Analytics
  {
    id: 'rates-by-type',
    title: { en: 'Exchange rates by type', ar: 'أسعار الصرف حسب نوع السعر' },
    entityName: 'ExchangeRates',
    groupByField: 'RateTypeName',
    chart: 'donut',
  },
  {
    id: 'rates-from-currency',
    title: { en: 'Exchange rates from currency', ar: 'أسعار الصرف من عملة' },
    entityName: 'ExchangeRates',
    groupByField: 'FromCurrency',
    chart: 'bar',
  },
  {
    id: 'rates-to-currency',
    title: { en: 'Exchange rates to currency', ar: 'أسعار الصرف إلى عملة' },
    entityName: 'ExchangeRates',
    groupByField: 'ToCurrency',
    chart: 'bar',
  },

  // System & User Analytics
  {
    id: 'users-by-language',
    title: { en: 'System users by language', ar: 'مستخدمو النظام حسب اللغة' },
    entityName: 'SystemUsers',
    groupByField: 'Language',
    chart: 'bar',
  },
  {
    id: 'users-by-company',
    title: { en: 'System users by company', ar: 'مستخدمو النظام حسب الشركة' },
    entityName: 'SystemUsers',
    groupByField: 'Company',
    chart: 'column',
  },

  // Group Distribution Analytics
  {
    id: 'customer-groups-distribution',
    title: { en: 'Customer groups by company', ar: 'مجموعات العملاء حسب الشركة' },
    entityName: 'CustomerGroups',
    groupByField: 'dataAreaId',
    chart: 'column',
  },
  {
    id: 'vendor-groups-distribution',
    title: { en: 'Vendor groups by company', ar: 'مجموعات الموردين حسب الشركة' },
    entityName: 'VendorGroups',
    groupByField: 'dataAreaId',
    chart: 'column',
  },
];

const MAX_GROUP_ROWS = 12;
const MAX_DRILL_KEY_LENGTH = 200;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 120;
const MAX_SKIP = 100_000;
const OVERVIEW_CACHE_MS = 15_000;

/** Mirrors the analytics engine's blank-group label. */
const BLANK_GROUP_KEY = '(blank)';

function safeMessage(error: unknown): string {
  return toPublicError(error).body.error.message;
}

/**
 * Builds a validated OData filter for a single group key. Group keys come
 * from our own groupBy output, and the expression is re-parsed and rebuilt
 * by the query builder before it ever reaches D365. Blank groups are matched
 * against both null and empty string, since the analytics engine labels
 * either as "(blank)".
 */
function buildGroupFilter(field: string, key: string): string {
  const trimmed = key.trim();
  if (trimmed === '' || trimmed === BLANK_GROUP_KEY) {
    return `(${field} eq null or ${field} eq '')`;
  }
  const value = trimmed.length > MAX_DRILL_KEY_LENGTH ? trimmed.slice(0, MAX_DRILL_KEY_LENGTH) : trimmed;
  return `${field} eq '${value.replace(/'/g, "''")}'`;
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
    // Batch scans so 35 breakdowns never hit D365 all at once.
    const concurrency = 5;
    const breakdowns: AnalysisBreakdown[] = new Array(BREAKDOWNS.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, BREAKDOWNS.length) }, async () => {
      while (cursor < BREAKDOWNS.length) {
        const index = cursor++;
        const definition = BREAKDOWNS[index] as BreakdownDefinition;
        breakdowns[index] = await this.runBreakdown(definition);
      }
    });
    await Promise.all(workers);

    return {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      breakdowns,
      // Runs after the worker pool so total concurrency stays bounded.
      salesVsReturns: await this.salesVsReturns(),
    };
  }

  /**
   * Sales-vs-returns ratio for the decision-support card. Both counts are
   * independent server-side counts and degrade independently.
   */
  private async salesVsReturns(): Promise<SalesVsReturns> {
    const salesEntitySet = 'SalesOrderHeadersV4';
    const returnEntitySet = 'ReturnOrderHeadersV2';
    // Promise.resolve() guards against providers that throw synchronously.
    const countSide = (entityName: string) =>
      Promise.resolve().then(() => this.options.analytics.run({ operation: 'count', entityName }));
    const sides = await Promise.allSettled([countSide(salesEntitySet), countSide(returnEntitySet)]);

    const read = (
      settled: PromiseSettledResult<{ value?: unknown; count?: number; complete: boolean }>,
      side: 'sales' | 'returns',
    ): { count: number | null; complete: boolean; error?: string } => {
      if (settled.status === 'rejected') {
        this.options.logger.warn('Sales-vs-returns count failed', {
          side,
          code: toPublicError(settled.reason).body.error.code,
        });
        return { count: null, complete: false, error: safeMessage(settled.reason) };
      }
      const value =
        typeof settled.value.value === 'number'
          ? settled.value.value
          : typeof settled.value.count === 'number'
            ? settled.value.count
            : null;
      return { count: value, complete: settled.value.complete === true };
    };

    const sales = read(sides[0], 'sales');
    const returns = read(sides[1], 'returns');
    const status: SalesVsReturns['status'] =
      sales.count !== null && returns.count !== null
        ? 'ok'
        : sales.count !== null || returns.count !== null
          ? 'partial'
          : 'unavailable';
    const returnRate =
      sales.count !== null && returns.count !== null && sales.count > 0
        ? Number((returns.count / sales.count).toFixed(4))
        : null;
    const error = sales.error ?? returns.error;

    return {
      status,
      salesEntitySet,
      returnEntitySet,
      salesCount: sales.count,
      returnCount: returns.count,
      returnRate,
      salesComplete: sales.complete,
      returnsComplete: returns.complete,
      ...(error && status !== 'ok' ? { error } : {}),
    };
  }

  private breakdownBase(definition: BreakdownDefinition) {
    return {
      id: definition.id,
      title: definition.title,
      entitySet: definition.entityName,
      groupByField: definition.groupByField,
      chart: definition.chart,
      section: definition.section ?? 'analysis',
      ...(definition.drillGroupByField ? { drillGroupByField: definition.drillGroupByField } : {}),
      ...(definition.aggregateOperation && definition.aggregateField
        ? { aggregate: { operation: definition.aggregateOperation, field: definition.aggregateField } }
        : {}),
    };
  }

  /** Maps an analytics groupBy result onto a breakdown, weighting share by
   * the value aggregate when the breakdown defines one. */
  private summarize(
    result: AnalyticsResult,
    base: ReturnType<DashboardService['breakdownBase']>,
  ): AnalysisBreakdown {
    const allGroups = result.groups ?? [];
    // Only weight by value when the aggregate actually carries a positive
    // total; otherwise (e.g. all-zero amounts) fall back to counts.
    const valueTotal = allGroups.reduce(
      (sum, group) =>
        sum + (typeof group.value === 'number' && Number.isFinite(group.value) ? group.value : 0),
      0,
    );
    const preferValue = Boolean(base.aggregate) && valueTotal > 0;
    const weight = (group: GroupResult) =>
      preferValue ? Number(group.value) || 0 : Number(group.count) || 0;
    const total = allGroups.reduce((sum, group) => sum + weight(group), 0);
    const groups = allGroups
      .slice()
      .sort((left, right) => weight(right) - weight(left))
      .slice(0, MAX_GROUP_ROWS)
      .map((group) => ({
        key: group.key,
        count: group.count,
        share: total > 0 ? Number((weight(group) / total).toFixed(4)) : 0,
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
  }

  private async runBreakdown(definition: BreakdownDefinition): Promise<AnalysisBreakdown> {
    const base = this.breakdownBase(definition);
    try {
      const result = await this.options.analytics.run({
        operation: 'groupBy',
        entityName: definition.entityName,
        groupByField: definition.groupByField,
        aggregateOperation: definition.aggregateOperation ?? 'count',
        ...(definition.aggregateField ? { aggregateField: definition.aggregateField } : {}),
      });
      return this.summarize(result, base);
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
  }

  /**
   * Re-queries a breakdown filtered to one group, grouped by the breakdown's
   * drill field. This powers the click-to-drill interaction on chart cards.
   */
  async drilldown(id: string, key: string): Promise<AnalysisBreakdown> {
    const definition = BREAKDOWNS.find((item) => item.id === id);
    if (!definition) throw new NotFoundError('Dashboard breakdown was not found.');
    if (!definition.drillGroupByField) {
      throw new ValidationError('This breakdown does not support drill-down.');
    }
    const trimmed = typeof key === 'string' ? key.trim() : '';
    if (!trimmed) throw new ValidationError('A drill-down group key is required.');
    if (trimmed.length > MAX_DRILL_KEY_LENGTH) {
      throw new ValidationError(
        `Drill-down key must be at most ${MAX_DRILL_KEY_LENGTH} characters.`,
      );
    }

    const base = {
      ...this.breakdownBase(definition),
      // Groups in a drill-down response are keyed by the drill field.
      groupByField: definition.drillGroupByField,
      drillKey: trimmed,
      parentGroupByField: definition.groupByField,
    };
    try {
      const result = await this.options.analytics.run({
        operation: 'groupBy',
        entityName: definition.entityName,
        groupByField: definition.drillGroupByField,
        aggregateOperation: definition.aggregateOperation ?? 'count',
        ...(definition.aggregateField ? { aggregateField: definition.aggregateField } : {}),
        filter: buildGroupFilter(definition.groupByField, trimmed),
      });
      return this.summarize(result, base);
    } catch (error) {
      this.options.logger.warn('Dashboard drill-down failed', {
        breakdown: id,
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
  }

  async records(
    id: string,
    options: { search?: string; top?: number; skip?: number; scan?: boolean } = {},
  ): Promise<ModuleRecords> {
    const module = findDashboardModule(id);
    if (!module) throw new NotFoundError('Dashboard module was not found.');

    const search = typeof options.search === 'string' ? options.search.trim() : '';
    if (search.length > MAX_SEARCH_LENGTH) {
      throw new ValidationError(`Search text must be at most ${MAX_SEARCH_LENGTH} characters.`);
    }
    const scanFields = options.scan ? (module.scanFields ?? []) : [];
    if (options.scan && scanFields.length === 0) {
      throw new ValidationError('This module does not support code scanning.');
    }
    if (options.scan && !search) {
      throw new ValidationError('A scanned code is required.');
    }
    if (search && !module.searchField && scanFields.length === 0) {
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
    let matchFields = scanFields.length > 0 ? scanFields : module.searchField ? [module.searchField] : [];
    if (search && entity && matchFields.length > 0) {
      const resolvedMatchFields: string[] = [];
      for (const matchField of matchFields) {
        const searchProperty = entity.properties.find(
          (property) => property.name.toLowerCase() === matchField.toLowerCase(),
        );
        if (!searchProperty) {
          throw new ValidationError('This module does not support text search.');
        }
        resolvedMatchFields.push(searchProperty.name);
        const alreadySelected = select.some(
          (field) => field.toLowerCase() === searchProperty.name.toLowerCase(),
        );
        if (!alreadySelected) select = [...select, searchProperty.name];
      }
      matchFields = resolvedMatchFields;
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

    if (search && matchFields.length > 0) {
      const scan = await this.options.client.fetchAllPages(
        query.entity.entitySet,
        this.options.queryBuilder.toScanParams(query),
        {
          maxRows: Math.max(1, this.options.searchMaxRows),
          pageSize: Math.max(1, this.options.searchPageSize),
        },
      );
      const needle = search.toLowerCase();
      const filtered = scan.rows.filter((row) => matchFields.some((field) => {
        const value = String(row?.[field] ?? '').toLowerCase();
        return options.scan ? value === needle : value.includes(needle);
      }));
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
