import { ValidationError } from '../errors';
import type { AppConfig } from '../config';
import type { Logger } from '../logger';
import type { D365Client } from '../d365/client';
import type { MetadataService } from '../metadata/service';
import type { EntityMetadata, EntityProperty } from '../metadata/types';
import { isNumericProperty, propertyKind } from '../metadata/types';
import type { QueryBuilder } from '../query/builder';
import type { AnalyticsEngine, AnalyticsOperation, AnalyticsRequest, GroupResult } from '../analytics/analytics';
import {
  compatibilityWarnings,
  growthPercent,
  rankBySum,
  relativePeriod,
  returnRate,
  salesContribution,
} from '../analytics/metrics';
import type { BusinessCategory } from '../metadata/business';
import {
  type AttachmentCollector,
  type CellValue,
  type TableColumn,
  dataRowsFromOData,
} from './attachments';
import type { AIToolDefinition } from './types';
import { friendlyLabel } from './business';
import { status, type AgentStatus } from './status';

export interface ToolContext {
  userId: string;
  conversationId?: string;
  toolCallId: string;
  collector: AttachmentCollector;
  signal?: AbortSignal;
  emitStatus: (update: AgentStatus) => void;
}

export interface ToolResult {
  content: unknown;
  isError?: boolean;
  meta?: {
    entitySet?: string;
    fields?: string[];
    rows?: number;
    complete?: boolean;
  };
}

export interface RegisteredTool {
  definition: AIToolDefinition;
  execute(args: unknown, context: ToolContext): Promise<ToolResult>;
}

interface DomainFields {
  identity?: EntityProperty;
  name?: EntityProperty;
  description?: EntityProperty;
  date?: EntityProperty;
  measure?: EntityProperty;
  quantity?: EntityProperty;
  currency?: EntityProperty;
  unit?: EntityProperty;
  company?: EntityProperty;
}

interface RequestDiagnostics {
  entitySet: string;
  fields: string[];
  filter?: string;
  params: Record<string, string>;
  url?: string;
  status?: number;
  rows: number;
  pages: number;
  complete: boolean;
  totalMatches?: number;
  requests: Array<{ url: string; status: number; rows: number; page: number }>;
  rejected?: RequestDiagnostics;
}

const TOOL_TIMEOUT_MS = 120_000;
const MAX_FILTER_ARG = 2_000;
const MAX_SELECT_ARG = 25;
const MAX_ORDER_BY_ARG = 10;

function asObject(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new ValidationError('Tool arguments must be a JSON object.');
  }
  return args as Record<string, unknown>;
}

function requireString(
  args: Record<string, unknown>,
  key: string,
  options: { min?: number; max?: number } = {},
): string {
  const raw = args[key];
  if (typeof raw !== 'string') throw new ValidationError(`"${key}" is required and must be a string.`);
  const value = raw.trim();
  const min = options.min ?? 1;
  const max = options.max ?? 300;
  if (value.length < min) throw new ValidationError(`"${key}" must not be empty.`);
  if (value.length > max) throw new ValidationError(`"${key}" must be at most ${max} characters.`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new ValidationError(`"${key}" contains invalid control characters.`);
  }
  return value;
}

function optionalString(
  args: Record<string, unknown>,
  key: string,
  options: { max?: number } = {},
): string | undefined {
  const raw = args[key];
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') throw new ValidationError(`"${key}" must be a string.`);
  const value = raw.trim();
  if (!value) return undefined;
  if (value.length > (options.max ?? 2_000)) {
    throw new ValidationError(`"${key}" is too long.`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new ValidationError(`"${key}" contains invalid control characters.`);
  }
  return value;
}

function optionalInt(
  args: Record<string, unknown>,
  key: string,
  options: { min: number; max: number; fallback: number },
): number {
  const raw = args[key];
  if (raw === undefined || raw === null) return options.fallback;
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ValidationError(`"${key}" must be an integer.`);
  }
  if (value < options.min) throw new ValidationError(`"${key}" must be at least ${options.min}.`);
  return Math.min(value, options.max);
}

function optionalStringArray(
  args: Record<string, unknown>,
  key: string,
  options: { maxItems: number; maxLength: number },
): string[] | undefined {
  const raw = args[key];
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw new ValidationError(`"${key}" must be an array of strings.`);
  if (raw.length > options.maxItems) {
    throw new ValidationError(`"${key}" may contain at most ${options.maxItems} items.`);
  }
  const values = raw.map((item) => {
    if (typeof item !== 'string') throw new ValidationError(`"${key}" must contain only strings.`);
    const value = item.trim();
    if (!value || value.length > options.maxLength) {
      throw new ValidationError(`"${key}" contains an invalid value.`);
    }
    return value;
  });
  return values.length > 0 ? values : undefined;
}

function optionalOrderBy(args: Record<string, unknown>): string | undefined {
  const raw = args.orderBy;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') {
    const value = raw.trim();
    if (!value) return undefined;
    if (value.length > 500) throw new ValidationError('"orderBy" is too long.');
    return value;
  }
  if (Array.isArray(raw)) {
    if (raw.length > MAX_ORDER_BY_ARG) throw new ValidationError('Too many orderBy fields.');
    if (!raw.every((item) => typeof item === 'string')) {
      throw new ValidationError('"orderBy" must be a string or array of strings.');
    }
    return raw.map((item) => (item as string).trim()).filter(Boolean).join(', ');
  }
  throw new ValidationError('"orderBy" must be a string or array of strings.');
}

function resolveProperty(entity: EntityMetadata, name: string): EntityProperty {
  const property = entity.properties.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!property) {
    throw new ValidationError(`Field "${name}" does not exist on entity "${entity.entitySet}".`);
  }
  return property;
}

function columnsFor(entity: EntityMetadata, select: string[]): TableColumn[] {
  return select.map((name) => {
    const property = resolveProperty(entity, name);
    return {
      key: property.name,
      label: friendlyLabel(property.name),
      type: propertyKind(property.type),
      isKey: property.isKey,
    };
  });
}

function orderByToString(entity: EntityMetadata, orderBy: Array<{ field: string; direction: string }>): string | undefined {
  if (orderBy.length === 0) return undefined;
  return orderBy.map((clause) => `${clause.field} ${clause.direction}`).join(', ');
}

function warningStringsFor(category: BusinessCategory, periodLabel: string, explicitPeriod: boolean): string[] {
  return [
    explicitPeriod
      ? `Analysis covers ${periodLabel}.`
      : `Analysis covers ${periodLabel} by default; state this period in the answer.`,
    category === 'inventory'
      ? 'Inventory quantities are a point-in-time snapshot, not a sales total.'
      : 'Figures are based on the exact records retrieved; do not extrapolate beyond them.',
  ];
}

function numberText(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? value.toLocaleString('en-US')
      : value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }
  return String(value);
}

function withTimeout<T>(promise: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new ValidationError('The ERP operation timed out. Try a narrower query.'));
    }, ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  constructor(
    private readonly metadata: MetadataService,
    private readonly queryBuilder: QueryBuilder,
    private readonly client: D365Client,
    private readonly analytics: AnalyticsEngine,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    for (const tool of this.createTools()) {
      this.tools.set(tool.definition.function.name, tool);
    }
  }

  get definitions(): AIToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(name: string, args: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        isError: true,
        content: {
          error: {
            code: 'UNKNOWN_TOOL',
            message: `Tool "${name}" is not registered. Use only the provided tools.`,
          },
        },
      };
    }

    const controller = new AbortController();
    const signal = context.signal
      ? AbortSignal.any([context.signal, controller.signal])
      : controller.signal;
    const started = Date.now();
    context.emitStatus(status('reading_metadata', { tool: name }));

    try {
      const result = await withTimeout(
        tool.execute(args, { ...context, signal }),
        TOOL_TIMEOUT_MS,
        controller,
      );
      this.logger.audit({
        action: `tool.${name}`,
        outcome: result.isError ? 'failure' : 'success',
        userRef: context.userId,
        conversationRef: context.conversationId,
        entitySet: result.meta?.entitySet,
        fields: result.meta?.fields,
        rowCount: result.meta?.rows,
        durationMs: Date.now() - started,
      });
      return result;
    } catch (error) {
      const message =
        error instanceof ValidationError
          ? error.publicMessage
          : (error as { publicMessage?: string }).publicMessage ||
            'The ERP tool failed to complete the request.';
      const code = (error as { code?: string }).code ?? 'TOOL_ERROR';
      this.logger.warn('Tool execution failed', {
        tool: name,
        errorCode: code,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        durationMs: Date.now() - started,
      });
      this.logger.audit({
        action: `tool.${name}`,
        outcome: 'failure',
        userRef: context.userId,
        conversationRef: context.conversationId,
        durationMs: Date.now() - started,
        errorCode: code,
      });
      return {
        isError: true,
        content: {
          error: {
            code,
            message,
          },
        },
      };
    }
  }

  /**
   * Picks the most suitable verified fact entity for a business category.
   * Entity names come only from metadata; no entity is hardcoded. Preference is
   * given to entities with an identity field, a date field and a numeric
   * measure, and configuration tables are demoted.
   */
  private async resolveFactEntity(
    category: BusinessCategory,
    question: string,
    preferredEntity?: string,
  ): Promise<EntityMetadata> {
    const catalog = await this.metadata.getCatalog();
    const resolution = await this.metadata.resolveBusiness(`${category} ${question}`, 25);
    const candidates = resolution.candidates.filter((candidate) => candidate.categories.includes(category));
    const preferred = preferredEntity
      ? catalog.getEntity(preferredEntity)
      : undefined;
    if (preferred?.metadataAvailable) return preferred;

    const scored = candidates
      .map((candidate) => {
        const entity = catalog.getEntity(candidate.entitySet);
        if (!entity || !entity.metadataAvailable) return undefined;
        // A domain must be confirmed by its own signature fields. Some demo
        // environments contain sales-shaped entities with "Return" in the name
        // but no return fields at all; those must never answer a returns question.
        const anchor = this.categoryAnchor(category);
        if (anchor && !entity.properties.some((property) => anchor.test(property.name))) {
          return undefined;
        }
        const fields = this.detectFields(entity, category);
        const richness =
          (fields.identity ? 6 : 0) +
          // A readable name field is essential for answering in business terms.
          (fields.name ? 12 : -6) +
          (fields.description ? 4 : 0) +
          (fields.date ? 5 : 0) +
          (fields.measure ? 6 : 0) +
          (fields.quantity ? 4 : 0);
        const setupPenalty = /(settings|setup|groups|types|codes|parameters|template|tolerance|coverage)/i.test(
          entity.entitySet,
        )
          ? 10
          : 0;
        return { entity, score: candidate.score + richness - setupPenalty };
      })
      .filter((item): item is { entity: EntityMetadata; score: number } => Boolean(item))
      .sort((a, b) => b.score - a.score);

    const chosen = scored[0]?.entity;
    if (!chosen) {
      throw new ValidationError(
        'No verified business data source could be found for this question. The request was not answered.',
      );
    }
    return chosen;
  }

  /**
   * Resolves a "list all X" question to a master data source. Unlike fact
   * analytics, a list must have both an account/code and a readable name, and
   * must not be satisfied by an invoice/order table that happens to mention the
   * same business domain.
   */
  private async resolveListEntity(
    category: BusinessCategory,
    question: string,
  ): Promise<{ entity: EntityMetadata; fields: DomainFields; resolution: Awaited<ReturnType<MetadataService['resolveBusiness']>> }> {
    const catalog = await this.metadata.getCatalog();
    const resolution = await this.metadata.resolveBusiness(`list of ${category} ${question}`, 25);
    const candidates: Array<{ entitySet: string; score: number; categories: BusinessCategory[] }> =
      resolution.candidates
        .filter((candidate) => candidate.categories.includes(category))
        .map((candidate) => ({
          entitySet: candidate.entitySet,
          score: candidate.score,
          categories: candidate.categories.filter((item) => item === category),
        }));
    // Business ranking favours measurable fact tables. A plain list instead
    // needs the master source, so also add verified catalog hits for the
    // domain's ordinary names and Arabic equivalents.
    const listSearchTerms: Partial<Record<BusinessCategory, string[]>> = {
      suppliers: ['vendors', 'vendor', 'supplier', 'الموردين', 'موردين', 'قائمة الموردين'],
      customers: ['customers', 'customer', 'العملاء', 'عملاء', 'قائمة العملاء'],
      products: ['released products', 'products', 'المنتجات', 'منتجات', 'قائمة المنتجات'],
    };
    const search = (catalog as { search?: (term: string, limit?: number) => Array<{ entitySet: string; score: number }> }).search;
    if (typeof search === 'function') {
      for (const term of listSearchTerms[category] ?? []) {
        for (const hit of search.call(catalog, term, 25)) {
          if (candidates.some((candidate) => candidate.entitySet === hit.entitySet)) continue;
          candidates.push({ entitySet: hit.entitySet, score: Math.min(45, hit.score / 2), categories: [category] });
        }
      }
    }
    const masterTerms: Partial<Record<BusinessCategory, RegExp>> = {
      suppliers: /vendor|supplier/i,
      customers: /customer/i,
      products: /releasedproduct|product|item/i,
    };
    const transactionPenalty =
      /(invoice|orderline|orderheader|salesline|purchaseline|line|transaction|payment|journal|address|contact|bank|group|setup|parameter|type|code|status)/i;
    const scored = candidates
      .map((candidate) => {
        const entity = catalog.getEntity(candidate.entitySet);
        if (!entity?.metadataAvailable) return undefined;
        const fields = this.detectFields(entity, category);
        if (!fields.identity || !fields.name) return undefined;
        const name = `${entity.entitySet} ${entity.entityType}`;
        const master = masterTerms[category]?.test(name) === true;
        const score =
          candidate.score +
          (master ? 12 : 0) +
          14 -
          (transactionPenalty.test(name) ? 24 : 0) +
          (fields.description ? 4 : 0);
        return { entity, fields, score };
      })
      .filter((item): item is { entity: EntityMetadata; fields: DomainFields; score: number } => Boolean(item))
      .sort((a, b) => b.score - a.score);

    const chosen = scored[0];
    if (!chosen) {
      throw new ValidationError(
        'No verified master data source with an account and name field could be found for this list request.',
      );
    }
    return { entity: chosen.entity, fields: chosen.fields, resolution };
  }

  /** Signature field required before an entity can answer a domain question. */
  private categoryAnchor(category: BusinessCategory): RegExp | undefined {
    if (category === 'returns') return /^return/i;
    return undefined;
  }

  /** Detects business fields for an entity using metadata property names/types. */
  private detectFields(entity: EntityMetadata, category: BusinessCategory): DomainFields {
    const find = (patterns: RegExp[], predicate?: (property: EntityProperty) => boolean): EntityProperty | undefined => {
      for (const pattern of patterns) {
        const match = entity.properties.find(
          (property) => pattern.test(property.name) && (predicate ? predicate(property) : true),
        );
        if (match) return match;
      }
      return undefined;
    };
    const identity = find([
      /^itemnumber$/i, /^productnumber$/i, /^displayproductnumber$/i, /^customervaccount$/i,
      /^customeraccount$/i, /^customeraccountnum$/i, /^custaccount$/i,
      /^vendoraccountnumber$/i, /^vendoraccount$/i, /^vendaccount$/i, /^accountnum$/i,
      /^salesordernumber$/i, /^invoicenumber$/i,
    ]);
    const name = find([
      /^productname$/i, /^itemname$/i, /^customername$/i, /^partyname$/i,
      /^vendororganizationname$/i, /^vendorname$/i, /^vendorsearchname$/i,
      /^vendorknownasname$/i, /^vendname$/i, /^namealias$/i, /^name$/i,
    ]);
    const description = find([
      /^productsearchname$/i,
      /^productdescription$/i,
      /^description$/i,
      /^itemsearchname$/i,
      /^vendorsearchname$/i,
      /^vendorknownasname$/i,
      /^searchname$/i,
    ]);
    const date = find(
      [
        /^invoicedate$/i, /^salesdate$/i, /^orderdate$/i, /^returndate$/i, /^returncloseddate$/i,
        /^createddatetime$/i, /^postingdate$/i, /^transdate$/i, /^date$/i,
      ],
      (property) => propertyKind(property.type) === 'date',
    );
    const moneyPatterns = [
      /^lineamount$/i, /^salesamount$/i, /^netamount$/i, /^amount$/i, /^totalamount$/i,
      /^amountmst$/i, /^price$/i, /^unitprice/i,
    ];
    const quantityPatterns = [
      /^returnsalesquantity$/i, /^returnqty$/i, /^returnedquantity$/i, /^salesqty$/i,
      /^quantity$/i, /^qty$/i, /^onhandquantity$/i, /^availablephysical$/i,
      /^availphysical$/i, /^physicalquantity$/i,
    ];
    const isNumber = (property: EntityProperty): boolean => isNumericProperty(property);
    const measure =
      category === 'inventory'
        ? undefined
        : category === 'returns'
          ? find(quantityPatterns, isNumber) ?? find(moneyPatterns, isNumber)
          : find(moneyPatterns, isNumber) ?? find(quantityPatterns, isNumber);
    const quantity = find(quantityPatterns, isNumber);
    const currency = find([/^currencycode$/i, /^currency$/i, /^currencyid$/i]);
    const unit = find([/^unitid$/i, /^unitofmeasure$/i, /^uom$/i]);
    const company = find([/^dataareaid$/i]);
    return {
      ...(identity ? { identity } : {}),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(date ? { date } : {}),
      ...(measure ? { measure } : {}),
      ...(quantity ? { quantity } : {}),
      ...(currency ? { currency } : {}),
      ...(unit ? { unit } : {}),
      ...(company ? { company } : {}),
    };
  }

  private escapeODataString(value: string): string {
    return value.replace(/'/g, "''");
  }

  private combineFilters(filters: Array<string | undefined>): string | undefined {
    const active = filters.filter((filter): filter is string => Boolean(filter));
    return active.length > 0 ? active.join(' and ') : undefined;
  }

  private buildDateFilter(field: EntityProperty | undefined, from?: string, to?: string): string | undefined {
    if (!field) return undefined;
    const clauses: string[] = [];
    // OData date/time literals must be quoted; the validator checks the value.
    if (from) clauses.push(`${field.name} ge '${this.escapeODataString(from)}'`);
    if (to) clauses.push(`${field.name} le '${this.escapeODataString(to)}'`);
    return clauses.length > 0 ? clauses.join(' and ') : undefined;
  }

  private buildProductFilter(fields: { identity?: EntityProperty; name?: EntityProperty }, term?: string): string | undefined {
    if (!term) return undefined;
    const escaped = this.escapeODataString(term);
    const clauses: string[] = [];
    if (fields.identity) clauses.push(`contains(${fields.identity.name}, '${escaped}')`);
    if (fields.name) clauses.push(`contains(${fields.name.name}, '${escaped}')`);
    return clauses.length > 0 ? `(${clauses.join(' or ')})` : undefined;
  }

  private createTools(): RegisteredTool[] {
    return [
      this.searchEntitiesTool(),
      this.getEntitySchemaTool(),
      this.queryEntityTool(),
      this.analyzeDataTool(),
      this.getRelatedEntitiesTool(),
      this.searchErpEntitiesTool(),
      this.getEntityMetadataTool(),
      this.searchErpRecordsTool(),
      this.listBusinessRecordsTool(),
      this.getSalesSummaryTool(),
      this.getInventorySummaryTool(),
      this.getReturnsSummaryTool(),
      this.compareBusinessPeriodsTool(),
      this.analyzeBusinessMetricsTool(),
    ];
  }

  private searchEntitiesTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'searchEntities',
          description:
            'Internal lookup: find the correct live business record collection for an ERP data question. Never call this for greetings, small talk, general knowledge, or questions unrelated to D365. Use it before a record lookup when the right collection is uncertain. The returned identifiers are private routing data; never show or describe them to the user.',
          parameters: {
            type: 'object',
            properties: {
              searchTerm: {
                type: 'string',
                description: 'Business terms in Arabic or English.',
              },
              limit: {
                type: 'integer',
                minimum: 1,
                maximum: 25,
                description: 'Maximum results (default 5).',
              },
            },
            required: ['searchTerm'],
          },
        },
      },
      execute: async (rawArgs, _context) => {
        const args = asObject(rawArgs);
        const searchTerm = requireString(args, 'searchTerm', { max: 300 });
        const limit = optionalInt(args, 'limit', { min: 1, max: 25, fallback: 5 });
        const results = await this.metadata.search(searchTerm, limit);
        return {
          content: {
            searchTerm,
            resultCount: results.length,
            results,
            hint:
              results.length === 0
                ? 'No matching EntitySet was found. Try broader English or Arabic business terms (e.g. customer, product, vendor, warehouse, sales order, inventory).'
                : 'Entity names and matched property names are actual D365 metadata.',
          },
        };
      },
    };
  }

  private getEntitySchemaTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'getEntitySchema',
          description:
            'Internal lookup: inspect which attributes are available for a business record lookup. Call only when the attribute list is genuinely needed; record tools validate attributes themselves. Never reveal the returned names to the user.',
          parameters: {
            type: 'object',
            properties: {
              entityName: {
                type: 'string',
                description: 'Exact EntitySet name returned by searchEntities.',
              },
              fieldContains: {
                type: 'string',
                description: 'Optional case-insensitive substring to filter field names, e.g. "price".',
              },
              maxFields: {
                type: 'integer',
                minimum: 1,
                maximum: 500,
                description: 'Maximum properties to return (default 60).',
              },
            },
            required: ['entityName'],
          },
        },
      },
      execute: async (rawArgs, context) => {
        const args = asObject(rawArgs);
        const entityName = requireString(args, 'entityName', { max: 200 });
        const fieldContains = optionalString(args, 'fieldContains', { max: 100 });
        const maxFields = optionalInt(args, 'maxFields', {
          min: 1,
          max: 500,
          fallback: this.config.ai.maxSchemaFields,
        });
        const schema = await this.metadata.getSchema(entityName, { fieldContains, maxFields });
        if (!schema) {
          throw new ValidationError(
            `Entity "${entityName}" was not found. Use searchEntities to find the correct EntitySet name.`,
          );
        }
        context.emitStatus(
          status('reading_metadata', {
            tool: 'getEntitySchema',
            entitySet: schema.entity.entitySet,
          }),
        );

        const catalog = await this.metadata.getCatalog();
        const navigation = schema.navigation.map((item) => ({
          name: item.name,
          targetType: item.targetType,
          isCollection: item.isCollection,
          targetEntitySets: catalog.getEntitySetsForType(item.targetType),
        }));

        return {
          content: {
            entitySet: schema.entity.entitySet,
            entityType: schema.entity.entityType,
            description: schema.entity.description ?? null,
            metadataAvailable: schema.entity.metadataAvailable,
            keys: schema.entity.keys,
            propertiesTotal: schema.propertiesTotal,
            propertiesReturned: schema.properties.length,
            propertiesTruncated: schema.truncated,
            properties: schema.properties.map((property) => ({
              name: property.name,
              type: property.type,
              key: property.isKey,
              nullable: property.nullable,
            })),
            navigationTotal: schema.navigationTotal,
            navigation,
            note:
              schema.truncated && fieldContains
                ? 'More matching fields exist. Increase maxFields or narrow fieldContains.'
                : schema.truncated
                  ? 'Schema output was truncated. Use fieldContains or increase maxFields to inspect more fields.'
                  : undefined,
          },
          meta: {
            entitySet: schema.entity.entitySet,
            fields: schema.properties.map((property) => property.name),
          },
        };
      },
    };
  }

  private queryEntityTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'queryEntity',
          description:
            'Read records from a validated D365 EntitySet (read-only). All fields, filters and sort clauses are validated against live metadata. Use this for listing/detail questions. For counts, totals, averages or grouping, use analyzeData instead so calculations are deterministic. String values in filters must be single-quoted; dates ISO; supported operators: eq ne gt ge lt le and or not; functions: startswith/endswith/contains.',
          parameters: {
            type: 'object',
            properties: {
              entityName: { type: 'string', description: 'Exact EntitySet name.' },
              select: {
                type: 'array',
                items: { type: 'string' },
                maxItems: MAX_SELECT_ARG,
                description: 'Fields to return. Omit for a safe default selection. Prefer the minimum needed.',
              },
              filter: {
                type: 'string',
                description:
                  'OData filter, e.g. "SalesOrderStatus eq \'Open\'" or "AvailPhysical gt 0". Field names are validated.',
              },
              orderBy: {
                type: 'string',
                description: 'Sort clause, e.g. "CreatedDateTime desc" or "ItemNumber asc".',
              },
              top: {
                type: 'integer',
                minimum: 1,
                maximum: 100,
                description: 'Rows to return (server maximum is enforced).',
              },
              skip: { type: 'integer', minimum: 0, description: 'Rows to skip.' },
              expand: {
                type: 'array',
                items: { type: 'string' },
                maxItems: 2,
                description: 'Optional navigation properties to expand, only when known to exist.',
              },
            },
            required: ['entityName'],
          },
        },
      },
      execute: async (rawArgs, context) => {
        const args = asObject(rawArgs);
        const entityName = requireString(args, 'entityName', { max: 200 });
        const select = optionalStringArray(args, 'select', {
          maxItems: MAX_SELECT_ARG,
          maxLength: 100,
        });
        const filter = optionalString(args, 'filter', { max: MAX_FILTER_ARG });
        const orderBy = optionalOrderBy(args);
        const top = optionalInt(args, 'top', {
          min: 1,
          max: this.config.ai.maxResultRows,
          fallback: 25,
        });
        const skip = optionalInt(args, 'skip', { min: 0, max: 100_000, fallback: 0 });
        const expand = optionalStringArray(args, 'expand', { maxItems: 2, maxLength: 100 });

        const query = await this.queryBuilder.validate({
          entityName,
          select,
          filter,
          orderBy,
          top,
          skip,
          expand,
        });

        context.emitStatus(
          status('querying_d365', {
            tool: 'queryEntity',
            entitySet: query.entity.entitySet,
            detail: `${query.select.length} field(s)`,
          }),
        );

        const response = await this.client.getEntity<{ value?: unknown }>(
          query.entity.entitySet,
          query.params,
          { signal: context.signal },
        );
        const rows = Array.isArray(response.data?.value)
          ? (response.data.value as Record<string, unknown>[])
          : [];
        const totalMatches = response.count;
        const complete =
          totalMatches !== undefined
            ? query.skip + rows.length >= totalMatches
            : !response.nextLink && rows.length < query.top;

        const columns = columnsFor(query.entity, query.select);
        const attachmentRows = dataRowsFromOData(rows, columns);
        const orderByText = orderByToString(query.entity, query.orderBy);
        const notes = [...query.notes];
        if (rows.length === 0) {
          notes.push('No rows matched. This is a real zero-result, not a failed request.');
        }
        if (!complete) {
          notes.push(
            totalMatches !== undefined
              ? `Only ${rows.length} of ${totalMatches} matching row(s) were returned. Do not claim the list is complete.`
              : 'Completeness could not be proven; do not claim the list is complete.',
          );
        }

        context.collector.addAttachment({
          type: 'table',
          id: `${context.toolCallId}-table`,
          title: query.entity.entitySet,
          ...(query.filter ? { subtitle: query.filter } : {}),
          entitySet: query.entity.entitySet,
          columns,
          rows: attachmentRows,
          ...(totalMatches !== undefined ? { totalRows: totalMatches } : {}),
          truncated: !complete,
        });

        context.collector.addSource({
          entitySet: query.entity.entitySet,
          entityType: query.entity.entityType,
          operation: 'query',
          ...(query.filter ? { filter: query.filter } : {}),
          rowsReturned: rows.length,
          ...(totalMatches !== undefined ? { totalMatches } : {}),
          complete,
          ...(notes.length > 0 ? { notes } : {}),
        });

        context.collector.addDataContext({
          entitySet: query.entity.entitySet,
          entityType: query.entity.entityType,
          operation: 'query',
          select: query.select,
          ...(query.filter ? { filter: query.filter } : {}),
          ...(orderByText ? { orderBy: orderByText } : {}),
          ...(totalMatches !== undefined ? { totalMatches } : {}),
          rowsReturned: rows.length,
          complete,
          capturedAt: new Date().toISOString(),
          sampleRows: attachmentRows.slice(0, 5),
        });

        const includedRows = attachmentRows.slice(0, this.config.ai.maxToolResultRows);
        return {
          content: {
            entitySet: query.entity.entitySet,
            entityType: query.entity.entityType,
            select: query.select,
            filter: query.filter ?? null,
            orderBy: orderByText ?? null,
            skip: query.skip,
            totalMatches: totalMatches ?? null,
            rowsReturned: rows.length,
            rowsIncludedInToolResult: includedRows.length,
            ...(totalMatches !== undefined ? { hasMore: query.skip + rows.length < totalMatches } : {}),
            complete,
            notes,
            rows: includedRows,
          },
          meta: {
            entitySet: query.entity.entitySet,
            fields: query.select,
            rows: rows.length,
            complete,
          },
        };
      },
    };
  }

  private analyzeDataTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'analyzeData',
          description:
            'Run a deterministic server-side calculation over live D365 records: count, sum, average, min, max, groupBy, or comparison. Preferred over manual arithmetic for totals, averages, grouped summaries and comparisons. The result includes complete=true/false and recordsScanned; never present a partial result as complete. For groupBy, provide groupByField and optionally aggregateField/aggregateOperation.',
          parameters: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['count', 'sum', 'average', 'min', 'max', 'groupBy', 'comparison'],
              },
              entityName: { type: 'string', description: 'Exact EntitySet name.' },
              field: {
                type: 'string',
                description: 'Numeric/date field for sum, average, min, max or comparison.',
              },
              aggregateField: {
                type: 'string',
                description: 'Field to aggregate for groupBy (required unless aggregateOperation=count).',
              },
              aggregateOperation: {
                type: 'string',
                enum: ['count', 'sum', 'average', 'min', 'max'],
                description: 'Aggregate used by groupBy/comparison (default count).',
              },
              groupByField: { type: 'string', description: 'Field to group by.' },
              filter: { type: 'string', description: 'Optional OData filter, validated against metadata.' },
              leftFilter: { type: 'string', description: 'Filter for side A of a comparison.' },
              rightFilter: { type: 'string', description: 'Filter for side B of a comparison.' },
              leftLabel: { type: 'string', description: 'Short label for side A.' },
              rightLabel: { type: 'string', description: 'Short label for side B.' },
              orderBy: {
                type: 'string',
                description: 'Optional stable sort for the underlying scan; keys are used by default.',
              },
            },
            required: ['operation', 'entityName'],
          },
        },
      },
      execute: async (rawArgs, context) => {
        const args = asObject(rawArgs);
        const operationRaw = requireString(args, 'operation', { max: 30 });
        const operations: AnalyticsOperation[] = [
          'count',
          'sum',
          'average',
          'min',
          'max',
          'groupBy',
          'comparison',
        ];
        if (!operations.includes(operationRaw as AnalyticsOperation)) {
          throw new ValidationError(
            `Unsupported operation "${operationRaw}". Use count, sum, average, min, max, groupBy or comparison.`,
          );
        }
        const operation = operationRaw as AnalyticsOperation;
        const entityName = requireString(args, 'entityName', { max: 200 });
        const field = optionalString(args, 'field', { max: 100 });
        const aggregateField = optionalString(args, 'aggregateField', { max: 100 });
        const aggregateOperationRaw = optionalString(args, 'aggregateOperation', { max: 20 });
        const allowedAggregates = ['count', 'sum', 'average', 'min', 'max'];
        if (aggregateOperationRaw && !allowedAggregates.includes(aggregateOperationRaw)) {
          throw new ValidationError(`Unsupported aggregateOperation "${aggregateOperationRaw}".`);
        }
        const groupByField = optionalString(args, 'groupByField', { max: 100 });
        const filter = optionalString(args, 'filter', { max: MAX_FILTER_ARG });
        const leftFilter = optionalString(args, 'leftFilter', { max: MAX_FILTER_ARG });
        const rightFilter = optionalString(args, 'rightFilter', { max: MAX_FILTER_ARG });
        const leftLabel = optionalString(args, 'leftLabel', { max: 60 });
        const rightLabel = optionalString(args, 'rightLabel', { max: 60 });
        const orderBy = optionalString(args, 'orderBy', { max: 500 });

        if (operation === 'groupBy' && !groupByField) {
          throw new ValidationError('groupBy requires groupByField.');
        }
        if (
          (operation === 'sum' || operation === 'average' || operation === 'min' || operation === 'max') &&
          !field
        ) {
          throw new ValidationError(`${operation} requires field.`);
        }
        if (operation === 'comparison' && !leftFilter && !rightFilter) {
          throw new ValidationError('comparison requires leftFilter and/or rightFilter.');
        }

        const request: AnalyticsRequest = {
          operation,
          entityName,
          ...(field ? { field } : {}),
          ...(aggregateField ? { aggregateField } : {}),
          ...(aggregateOperationRaw
            ? { aggregateOperation: aggregateOperationRaw as AnalyticsRequest['aggregateOperation'] }
            : {}),
          ...(groupByField ? { groupByField } : {}),
          ...(filter ? { filter } : {}),
          ...(leftFilter ? { leftFilter } : {}),
          ...(rightFilter ? { rightFilter } : {}),
          ...(leftLabel ? { leftLabel } : {}),
          ...(rightLabel ? { rightLabel } : {}),
          ...(orderBy ? { orderBy } : {}),
        };

        context.emitStatus(status('analyzing_data', { tool: 'analyzeData', entitySet: entityName }));
        const result = await this.analytics.run(request, { signal: context.signal });
        this.buildAnalyticsAttachments(result, context);
        context.collector.addSource({
          entitySet: result.entitySet,
          entityType: result.entityType,
          operation: result.operation,
          ...(result.filter ? { filter: result.filter } : {}),
          rowsReturned: result.recordsScanned,
          ...(result.totalMatches !== undefined ? { totalMatches: result.totalMatches } : {}),
          complete: result.complete,
          ...(result.notes.length > 0 ? { notes: result.notes } : {}),
        });
        if (result.comparison) {
          for (const side of [result.comparison.left, result.comparison.right]) {
            context.collector.addSource({
              entitySet: result.entitySet,
              entityType: result.entityType,
              operation: `${result.operation}:${side.label}`,
              ...(side.filter ? { filter: side.filter } : {}),
              rowsReturned: side.recordsScanned,
              complete: side.complete,
            });
          }
        }
        context.collector.addDataContext({
          entitySet: result.entitySet,
          entityType: result.entityType,
          operation: result.operation,
          ...(result.filter ? { filter: result.filter } : {}),
          ...(result.totalMatches !== undefined ? { totalMatches: result.totalMatches } : {}),
          rowsReturned: result.recordsScanned,
          complete: result.complete,
          capturedAt: new Date().toISOString(),
          summary: {
            value: result.value ?? null,
            count: result.count ?? null,
            groups: result.groups
              ? result.groups
                  .slice(0, 5)
                  .map((group) => `${group.key}: ${group.value ?? group.count}`)
                  .join(' | ')
              : null,
          },
        });

        return {
          content: result,
          meta: {
            entitySet: result.entitySet,
            rows: result.recordsScanned,
            complete: result.complete,
          },
        };
      },
    };
  }

  private getRelatedEntitiesTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'getRelatedEntities',
          description:
            'Internal lookup: discover related business record collections for one collection. Use it only to plan a follow-up lookup; never reveal the returned names or relationships to the user.',
          parameters: {
            type: 'object',
            properties: {
              entityName: { type: 'string', description: 'Exact EntitySet name.' },
              limit: {
                type: 'integer',
                minimum: 1,
                maximum: 100,
                description: 'Maximum relationships to return (default 40).',
              },
            },
            required: ['entityName'],
          },
        },
      },
      execute: async (rawArgs, context) => {
        const args = asObject(rawArgs);
        const entityName = requireString(args, 'entityName', { max: 200 });
        const limit = optionalInt(args, 'limit', { min: 1, max: 100, fallback: 40 });
        const result = await this.metadata.getRelated(entityName, limit);
        if (!result) {
          throw new ValidationError(
            `Entity "${entityName}" was not found. Use searchEntities to find the correct EntitySet name.`,
          );
        }
        const outgoing = result.related.filter((item) => item.direction === 'outgoing');
        const incoming = result.related.filter((item) => item.direction === 'incoming');

        const columns: TableColumn[] = [
          { key: 'direction', label: 'Direction', type: 'string' },
          { key: 'navigationProperty', label: 'Navigation property', type: 'string' },
          { key: 'entitySet', label: 'EntitySet', type: 'string' },
          { key: 'entityType', label: 'Entity type', type: 'string' },
          { key: 'isCollection', label: 'Collection', type: 'boolean' },
        ];
        const rows = result.related.map((item) => ({
          direction: item.direction,
          navigationProperty: item.navigationProperty ?? null,
          entitySet: item.entitySet ?? null,
          entityType: item.entityType,
          isCollection: item.isCollection ?? null,
        }));
        context.collector.addAttachment({
          type: 'table',
          id: `${context.toolCallId}-relations`,
          title: `Relationships · ${result.entity.entitySet}`,
          columns,
          rows: rows as Record<string, CellValue>[],
          truncated: result.related.length >= limit,
        });

        return {
          content: {
            entitySet: result.entity.entitySet,
            entityType: result.entity.entityType,
            metadataAvailable: result.entity.metadataAvailable,
            outgoingCount: outgoing.length,
            incomingCount: incoming.length,
            related: result.related,
            note:
              result.related.length === 0
                ? 'D365 metadata exposes no navigation properties for this entity. Do not invent relationships.'
                : 'Only these metadata relationships are real. Use queryEntity with expand only when appropriate.',
          },
          meta: {
            entitySet: result.entity.entitySet,
            rows: result.related.length,
          },
        };
      },
    };
  }

  private searchErpEntitiesTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'search_erp_entities',
          description:
            'Internal discovery: find the verified ERP data source for an Arabic or English business question. Use this first whenever the right business data source is uncertain. Returns only metadata-derived candidates with matched business fields. Never reveal the returned names or identifiers to the user.',
          parameters: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'The full business question in Arabic or English.',
              },
              limit: { type: 'integer', minimum: 1, maximum: 12, description: 'Maximum candidates (default 6).' },
            },
            required: ['question'],
          },
        },
      },
      execute: async (rawArgs) => {
        const args = asObject(rawArgs);
        const question = requireString(args, 'question', { max: 400 });
        const limit = optionalInt(args, 'limit', { min: 1, max: 12, fallback: 6 });
        const resolution = await this.metadata.resolveBusiness(question, limit);
        return {
          content: {
            language: resolution.language,
            detectedBusinessAreas: resolution.signals.map((signal) => ({
              area: signal.category,
              confidence: Math.round(signal.confidence * 100) / 100,
              matchedTerms: signal.matchedTerms,
            })),
            candidates: resolution.candidates,
            notes: resolution.notes,
          },
        };
      },
    };
  }

  private getEntityMetadataTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'get_entity_metadata',
          description:
            'Internal lookup: inspect verified fields and declared relationships for one ERP data source before querying it. Never show field or source names to the user.',
          parameters: {
            type: 'object',
            properties: {
              entityName: { type: 'string', description: 'Exact EntitySet name from discovery.' },
              fieldContains: { type: 'string', description: 'Optional field-name substring.' },
            },
            required: ['entityName'],
          },
        },
      },
      execute: async (rawArgs, context) => {
        const args = asObject(rawArgs);
        const entityName = requireString(args, 'entityName', { max: 200 });
        const fieldContains = optionalString(args, 'fieldContains', { max: 100 });
        const schema = await this.metadata.getSchema(entityName, {
          fieldContains,
          maxFields: this.config.ai.maxSchemaFields,
        });
        if (!schema) {
          throw new ValidationError('The requested ERP data source could not be verified.');
        }
        context.emitStatus(status('reading_metadata', { tool: 'get_entity_metadata', entitySet: schema.entity.entitySet }));
        return {
          content: {
            entitySet: schema.entity.entitySet,
            keys: schema.entity.keys,
            properties: schema.properties.map((property) => ({
              name: property.name,
              type: property.type,
              key: property.isKey,
            })),
            propertiesTruncated: schema.truncated,
            navigation: schema.navigation.map((nav) => ({
              name: nav.name,
              targetTypeShort: nav.targetTypeShort,
              isCollection: nav.isCollection,
            })),
            note: 'Use these verified fields only. Do not invent fields or relationships.',
          },
          meta: { entitySet: schema.entity.entitySet, fields: schema.properties.map((property) => property.name) },
        };
      },
    };
  }

  private searchErpRecordsTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'search_erp_records',
          description:
            'Search real ERP records for business entities such as a named product or customer. The data source and fields are chosen from verified metadata. Accepts a business search term, not a technical filter. Read-only.',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The business question, for domain resolution.' },
              searchTerm: { type: 'string', description: 'The business name or code to search for.' },
              category: {
                type: 'string',
                enum: ['products', 'sales', 'returns', 'inventory', 'purchasing', 'production', 'customers', 'suppliers'],
                description: 'Business domain to search in.',
              },
              limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum records (default 10).' },
            },
            required: ['question', 'searchTerm', 'category'],
          },
        },
      },
      execute: async (rawArgs, context) => {
        const args = asObject(rawArgs);
        const question = requireString(args, 'question', { max: 400 });
        const searchTerm = requireString(args, 'searchTerm', { max: 200 });
        const categoryRaw = requireString(args, 'category', { max: 30 });
        const categories: BusinessCategory[] = [
          'products', 'sales', 'returns', 'inventory', 'purchasing', 'production', 'customers', 'suppliers',
        ];
        if (!categories.includes(categoryRaw as BusinessCategory)) {
          throw new ValidationError('Unsupported business domain.');
        }
        const category = categoryRaw as BusinessCategory;
        const limit = optionalInt(args, 'limit', { min: 1, max: 50, fallback: 10 });
        // Named records such as a product line, brand or customer must be
        // searched in the master source. Fact tables only contain transaction
        // rows and cannot prove which products are currently listed.
        const masterSearch = category === 'products' || category === 'customers' || category === 'suppliers';
        const resolved = masterSearch ? await this.resolveListEntity(category, question) : undefined;
        const entity = resolved?.entity ?? (await this.resolveFactEntity(category, question));
        const fields = resolved?.fields ?? this.detectFields(entity, category);
        const select = [fields.identity?.name, fields.name?.name, fields.description?.name]
          .filter((value): value is string => Boolean(value))
          .slice(0, MAX_SELECT_ARG);
        if (select.length === 0) {
          throw new ValidationError('The verified data source has no usable business name field.');
        }
        const filter = this.buildProductFilter(fields, searchTerm);
        context.emitStatus(status('querying_d365', { tool: 'search_erp_records', entitySet: entity.entitySet }));
        const scan = await this.fetchDomainRows(
          entity.entitySet,
          select,
          filter,
          undefined,
          this.buildLocalPredicate(fields, searchTerm, undefined, undefined),
          context,
        );
        const rows = scan.rows.slice(0, limit);
        const entityMeta = await this.metadata.getEntity(scan.entitySet);
        const columns = entityMeta ? columnsFor(entityMeta, select) : [];
        const attachmentRows = dataRowsFromOData(rows, columns);
        const notes = [
          rows.length === 0
            ? 'No records matched this search term. This is a genuine no-record result, not a failed request.'
            : 'Records are real ERP records. Do not invent additional records.',
          ...scan.notes,
          ...(scan.complete
            ? []
            : ['Only a bounded portion of available records was reviewed; results must be described as partial.']),
        ];
        context.collector.addSource({
          entitySet: scan.entitySet,
          entityType: entityMeta?.entityType ?? 'Business records',
          operation: 'record_search',
          rowsReturned: rows.length,
          complete: scan.complete,
          notes,
        });
        context.collector.addDataContext({
          entitySet: scan.entitySet,
          entityType: entityMeta?.entityType ?? 'Business records',
          operation: 'record_search',
          select,
          rowsReturned: rows.length,
          complete: scan.complete,
          capturedAt: new Date().toISOString(),
        });
        if (rows.length > 0) {
          context.collector.addAttachment({
            type: 'table',
            id: `${context.toolCallId}-records`,
            title: 'Matching business records',
            rows: attachmentRows,
            columns,
            truncated: !scan.complete || rows.length >= this.config.ai.maxToolResultRows,
          });
        }
        return {
          content: {
            entitySet: scan.entitySet,
            searchTerm,
            recordsScanned: scan.scanned,
            rowsReturned: rows.length,
            rows: attachmentRows.slice(0, this.config.ai.maxToolResultRows),
            note: notes[0],
            ...(scan.notes.length > 0 ? { warnings: scan.notes } : {}),
          },
          meta: { entitySet: scan.entitySet, fields: select, rows: rows.length },
        };
      },
    };
  }

  private listBusinessRecordsTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'list_business_records',
          description:
            'List all real ERP master records for a business domain when the user asks for a plain list without naming a specific product line, brand, customer or supplier. The master data source and its account/name fields are resolved from verified metadata. No record-name filter is applied. For a named item, use search_erp_records instead. Read-only.',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The full business question in Arabic or English.' },
              category: {
                type: 'string',
                enum: ['suppliers', 'customers', 'products'],
                description: 'Business domain whose master records should be listed.',
              },
              limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum records to display (default 50).' },
            },
            required: ['question', 'category'],
          },
        },
      },
      execute: async (rawArgs, context) => {
        const args = asObject(rawArgs);
        const question = requireString(args, 'question', { max: 400 });
        const categoryRaw = requireString(args, 'category', { max: 30 });
        const listCategories: BusinessCategory[] = ['suppliers', 'customers', 'products'];
        if (!listCategories.includes(categoryRaw as BusinessCategory)) {
          throw new ValidationError('Unsupported business domain for a record list.');
        }
        const category = categoryRaw as BusinessCategory;
        const limit = optionalInt(args, 'limit', { min: 1, max: 100, fallback: 50 });
        const { entity, fields } = await this.resolveListEntity(category, question);
        const select = [fields.identity?.name, fields.name?.name, fields.description?.name]
          .filter((value): value is string => Boolean(value))
          .slice(0, MAX_SELECT_ARG);
        if (select.length < 2) {
          throw new ValidationError('The verified data source does not expose both an account and a name field.');
        }
        context.emitStatus(status('querying_d365', { tool: 'list_business_records', entitySet: entity.entitySet }));
        const scan = await this.fetchDomainRows(
          entity.entitySet,
          select,
          undefined,
          undefined,
          () => true,
          context,
        );
        const rows = scan.rows.slice(0, limit);
        const columns = columnsFor(entity, select);
        const attachmentRows = dataRowsFromOData(rows, columns);
        const note =
          rows.length === 0
            ? scan.serverFiltered
              ? 'No records were returned by the verified master data source. This is a genuine zero-record result, not a failed request.'
              : 'No records were returned within the bounded review; this is not a genuine zero-record result.'
            : `${numberText(rows.length)} real ERP records were retrieved from the verified master data source.`;
        const notes = [
          note,
          ...scan.notes,
          ...(scan.complete
            ? []
            : ['Only a bounded portion of available records was reviewed; results must be described as partial.']),
        ];
        context.collector.addSource({
          entitySet: scan.entitySet,
          entityType: scan.entityType,
          operation: `${category}_list`,
          rowsReturned: rows.length,
          ...(scan.diagnostics.totalMatches !== undefined ? { totalMatches: scan.diagnostics.totalMatches } : {}),
          complete: scan.complete,
          notes,
        });
        context.collector.addDataContext({
          entitySet: scan.entitySet,
          entityType: scan.entityType,
          operation: `${category}_list`,
          select,
          rowsReturned: rows.length,
          complete: scan.complete,
          capturedAt: new Date().toISOString(),
          summary: {
            ...(fields.identity?.name ? { accountField: fields.identity.name } : {}),
            ...(fields.name?.name ? { nameField: fields.name.name } : {}),
          },
        });
        context.collector.addAttachment({
          type: 'table',
          id: `${context.toolCallId}-records`,
          title: `${friendlyLabel(category)} records`,
          rows: attachmentRows,
          columns,
          truncated: !scan.complete || rows.length < scan.rows.length,
        });
        return {
          content: {
            businessArea: category,
            entitySet: scan.entitySet,
            fields: {
              account: fields.identity?.name,
              name: fields.name?.name,
              description: fields.description?.name,
              selected: select,
            },
            recordsScanned: scan.scanned,
            rowsReturned: rows.length,
            rows: attachmentRows.slice(0, this.config.ai.maxToolResultRows),
            complete: scan.complete,
            note,
            ...(scan.notes.length > 0 ? { warnings: scan.notes } : {}),
            request: scan.diagnostics,
          },
          meta: { entitySet: scan.entitySet, fields: select, rows: rows.length, complete: scan.complete },
        };
      },
    };
  }

  /**
   * Some D365 entity sets reject filters on non-key fields or string functions.
   * When that happens, fall back to a bounded read-only scan and apply the same
   * predicate locally. The result is explicitly marked partial; a rejected
   * request is never reported as a genuine zero-record result.
   */
  private async fetchDomainRows(
    entityName: string,
    select: string[],
    filter: string | undefined,
    orderBy: string | undefined,
    localPredicate: (row: Record<string, unknown>) => boolean,
    context: ToolContext,
  ): Promise<{
    entitySet: string;
    entityType: string;
    filter?: string;
    rows: Record<string, unknown>[];
    /** Unfiltered rows from the same scan, reused for all-history fallback. */
    allRows: Record<string, unknown>[];
    complete: boolean;
    scanned: number;
    serverFiltered: boolean;
    notes: string[];
    diagnostics: RequestDiagnostics;
  }> {
    const maxRows = this.config.d365.analyticsMaxRows;
    // When a legal entity is configured, scope every read to that company and
    // re-check it locally even if the server accepts the filter.
    const catalog = await this.metadata.getCatalog();
    const entity = catalog.getEntity(entityName);
    const dataArea = this.config.d365.dataArea;
    const companyField = dataArea
      ? entity?.properties.find((property) => property.name.toLowerCase() === 'dataareaid')
      : undefined;
    if (dataArea && !companyField) {
      throw new ValidationError(
        'The verified data source cannot be scoped to the configured legal entity.',
      );
    }
    const companyFilter =
      dataArea && companyField
        ? `${companyField.name} eq '${this.escapeODataString(dataArea)}'`
        : undefined;
    const scopedFilter = this.combineFilters([filter, companyFilter]);
    const scopedSelect =
      companyField && dataArea && !select.includes(companyField.name)
        ? [...select, companyField.name]
        : select;
    const inCompany = (row: Record<string, unknown>): boolean =>
      !companyField || !dataArea || String(row[companyField.name] ?? '') === dataArea;
    const predicate = (row: Record<string, unknown>): boolean => inCompany(row) && localPredicate(row);
    const execute = async (activeFilter?: string) => {
      const query = await this.queryBuilder.validate({
        entityName,
        select: scopedSelect,
        ...(activeFilter ? { filter: activeFilter } : {}),
        ...(orderBy ? { orderBy } : {}),
        top: maxRows,
      });
      const scan = await this.client.fetchAllPages(query.entity.entitySet, query.params, {
        maxRows,
        pageSize: this.config.d365.pageSize,
        signal: context.signal,
      });
      const last = scan.requests?.[(scan.requests?.length ?? 0) - 1];
      this.logger.info('D365 OData read', {
        entitySet: query.entity.entitySet,
        fields: scopedSelect,
        ...(activeFilter ? { filter: activeFilter } : {}),
        url: last?.url,
        httpStatus: last?.status,
        rows: scan.rows.length,
        pages: scan.pages,
        complete: scan.complete,
      });
      return { query, scan };
    };

    type Execution = Awaited<ReturnType<typeof execute>>;
    const diagnostic = (
      { query, scan }: Execution,
      activeFilter?: string,
      rejected?: RequestDiagnostics,
    ): RequestDiagnostics => {
      const last = scan.requests?.[(scan.requests?.length ?? 0) - 1];
      return {
        entitySet: query.entity.entitySet,
        fields: scopedSelect,
        ...(activeFilter ? { filter: activeFilter } : {}),
        params: query.params,
        ...(last ? { url: last.url, status: last.status } : {}),
        rows: scan.rows.length,
        pages: scan.pages,
        complete: scan.complete,
        ...(scan.totalMatches !== undefined ? { totalMatches: scan.totalMatches } : {}),
        requests: scan.requests ?? [],
        ...(rejected ? { rejected } : {}),
      };
    };

    let rejectedRequest: RequestDiagnostics | undefined;
    if (scopedFilter) {
      try {
        const execution = await execute(scopedFilter);
        // Re-apply the validated predicate even when the ERP accepted the
        // filter. This protects against case/format differences and mocked or
        // unexpectedly permissive ERP responses.
        return {
          entitySet: execution.query.entity.entitySet,
          entityType: execution.query.entity.entityType,
          filter: scopedFilter,
          rows: execution.scan.rows.filter(predicate),
          allRows: execution.scan.rows.filter(inCompany),
          complete: execution.scan.complete,
          scanned: execution.scan.scanned,
          serverFiltered: true,
          notes: [],
          diagnostics: diagnostic(execution, scopedFilter),
        };
      } catch (error) {
        const details = (error as { details?: { upstreamStatus?: number; url?: string } }).details;
        this.logger.warn('D365 OData read rejected', {
          entitySet: entityName,
          fields: scopedSelect,
          filter: scopedFilter,
          url: details?.url,
          httpStatus: details?.upstreamStatus,
          error: error instanceof Error ? error.message : String(error),
        });
        if (details?.upstreamStatus !== 400) throw error;
        rejectedRequest = {
          entitySet: entityName,
          fields: scopedSelect,
          filter: scopedFilter,
          params: {},
          ...(details?.url ? { url: details.url } : {}),
          ...(details?.upstreamStatus !== undefined ? { status: details.upstreamStatus } : {}),
          rows: 0,
          pages: 0,
          complete: false,
          requests: [],
        };
      }
    }

    const execution = await execute(undefined);
    if (!scopedFilter) {
      return {
        entitySet: execution.query.entity.entitySet,
        entityType: execution.query.entity.entityType,
        rows: execution.scan.rows.filter(predicate),
        allRows: execution.scan.rows.filter(inCompany),
        complete: execution.scan.complete,
        scanned: execution.scan.scanned,
        serverFiltered: true,
        notes: [],
        diagnostics: diagnostic(execution),
      };
    }
    const rows = execution.scan.rows.filter(predicate);
    return {
      entitySet: execution.query.entity.entitySet,
      entityType: execution.query.entity.entityType,
      filter: scopedFilter,
      rows,
      allRows: execution.scan.rows.filter(inCompany),
      complete: false,
      scanned: execution.scan.scanned,
      serverFiltered: false,
      notes: [
        'The ERP did not accept the requested server-side filter. A bounded scan of real records was applied locally; figures must be described as partial.',
      ],
      diagnostics: diagnostic(execution, scopedFilter, rejectedRequest),
    };
  }

  private buildLocalPredicate(
    fields: {
      identity?: EntityProperty;
      name?: EntityProperty;
      description?: EntityProperty;
      date?: EntityProperty;
    },
    productTerm: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ): (row: Record<string, unknown>) => boolean {
    const term = productTerm?.toLowerCase();
    const fromMs = from ? Date.parse(from) : undefined;
    const toMs = to ? Date.parse(to) : undefined;
    return (row) => {
      if (term) {
        const values = [fields.identity?.name, fields.name?.name, fields.description?.name]
          .filter((value): value is string => Boolean(value))
          .map((name) => String(row[name] ?? '').toLowerCase());
        if (!values.some((value) => value.includes(term))) return false;
      }
      if (fields.date && (fromMs !== undefined || toMs !== undefined)) {
        const raw = row[fields.date.name];
        const time = raw === null || raw === undefined || raw === '' ? Number.NaN : Date.parse(String(raw));
        if (fromMs !== undefined && !(time >= fromMs)) return false;
        if (toMs !== undefined && !(time <= toMs)) return false;
      }
      return true;
    };
  }

  /**
   * Resolves a business product name (English or Arabic) to verified product
   * codes using real product records. The model never supplies item numbers.
   */
  private async resolveProductCodes(term: string, context: ToolContext): Promise<string[]> {
    try {
      const entity = await this.resolveFactEntity('products', term);
      const fields = this.detectFields(entity, 'products');
      const identity = fields.identity;
      const name = fields.name;
      const description = fields.description;
      if (!identity && !name && !description) return [];
      const select = [identity?.name, name?.name, description?.name]
        .filter((value): value is string => Boolean(value))
        .slice(0, MAX_SELECT_ARG);
      const scan = await this.fetchDomainRows(
        entity.entitySet,
        select,
        undefined,
        undefined,
        () => true,
        context,
      );
      const needle = term.toLowerCase();
      const codes = new Set<string>();
      for (const row of scan.rows) {
        const identityValue = identity ? String(row[identity.name] ?? '') : '';
        const nameValue = name ? String(row[name.name] ?? '') : '';
        const descriptionValue = description ? String(row[description.name] ?? '') : '';
        if (
          identityValue.toLowerCase().includes(needle) ||
          nameValue.toLowerCase().includes(needle) ||
          descriptionValue.toLowerCase().includes(needle)
        ) {
          if (identityValue) codes.add(identityValue);
        }
      }
      return [...codes].slice(0, 10);
    } catch {
      return [];
    }
  }

  /** Best-effort business names for product codes, from verified product records. */
  private async loadProductNames(context: ToolContext): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    try {
      const entity = await this.resolveFactEntity('products', 'product name');
      const fields = this.detectFields(entity, 'products');
      if (!fields.identity || !fields.name) return names;
      const scan = await this.fetchDomainRows(
        entity.entitySet,
        [fields.identity.name, fields.name.name],
        undefined,
        undefined,
        () => true,
        context,
      );
      for (const row of scan.rows) {
        const code = String(row[fields.identity.name] ?? '').split(' :')[0];
        const name = String(row[fields.name.name] ?? '').trim();
        if (code && name) names.set(code, name);
      }
    } catch {
      // Enrichment is best-effort; the raw business key remains available.
    }
    return names;
  }

  /** Shared deterministic aggregation used by the domain summary tools. */
  private async runDomainSummary(
    category: BusinessCategory,
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const question = optionalString(args, 'question', { max: 400 }) ?? category;
    const productTerm = optionalString(args, 'productTerm', { max: 200 });
    const from = optionalString(args, 'from', { max: 40 });
    const to = optionalString(args, 'to', { max: 40 });
    const months = optionalInt(args, 'months', { min: 1, max: 60, fallback: 6 });
    const explicitPeriod = Boolean(from || to);
    const topN = optionalInt(args, 'topN', { min: 1, max: 25, fallback: 10 });

    const entity = await this.resolveFactEntity(category, question);
    const fields = this.detectFields(entity, category);
    const now = new Date();
    const relative = relativePeriod(now, { months });
    const range = explicitPeriod
      ? {
          from: from ?? new Date(0).toISOString(),
          to: to ?? now.toISOString(),
          label: `${(from ?? 'earliest').slice(0, 10)} to ${(to ?? 'now').slice(0, 10)}`,
        }
      : relative;
    // Resolve product names to verified codes before filtering fact records.
    let resolvedCodes: string[] = [];
    let effectiveTerm = productTerm;
    if (productTerm && category !== 'products') {
      resolvedCodes = await this.resolveProductCodes(productTerm, context);
      if (resolvedCodes.length > 0) effectiveTerm = undefined;
    }

    const usePeriod = category === 'sales' || category === 'returns';
    const valueField = fields.measure ?? fields.quantity;
    if (!valueField) {
      throw new ValidationError('The verified data source has no numeric business measure for this question.');
    }
    const keyField = fields.identity ?? fields.name;
    if (!keyField) {
      throw new ValidationError('The verified data source has no product or business name field.');
    }
    const labelField = fields.name?.name !== keyField.name ? fields.name : undefined;

    const select = [
      keyField.name,
      labelField?.name,
      valueField.name,
      fields.date?.name,
      fields.currency?.name,
      fields.unit?.name,
    ]
      .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
      .slice(0, MAX_SELECT_ARG);

    context.emitStatus(
      status('querying_d365', {
        tool: `${category}_summary`,
        entitySet: entity.entitySet,
        detail: `${select.length} field(s)`,
      }),
    );

    const codeFilter =
      resolvedCodes.length > 0 && fields.identity
        ? `(${resolvedCodes
            .map((code) => `startswith(${fields.identity!.name}, '${this.escapeODataString(code)}')`)
            .join(' or ')})`
        : undefined;

    const productOnlyLocal = this.buildLocalPredicate(fields, effectiveTerm, undefined, undefined);
    const productOnlyPredicate = (row: Record<string, unknown>): boolean => {
      if (resolvedCodes.length > 0 && fields.identity) {
        const value = String(row[fields.identity.name] ?? '');
        return (
          resolvedCodes.some((code) => value === code || value.startsWith(`${code} :`)) &&
          productOnlyLocal(row)
        );
      }
      return productOnlyLocal(row);
    };

    const scanFor = (withPeriod: boolean) => {
      const filter = this.combineFilters([
        codeFilter ?? this.buildProductFilter(fields, effectiveTerm),
        withPeriod && usePeriod ? this.buildDateFilter(fields.date, range.from, range.to) : undefined,
      ]);
      const localPredicate = this.buildLocalPredicate(
        fields,
        effectiveTerm,
        withPeriod && usePeriod ? range.from : undefined,
        withPeriod && usePeriod ? range.to : undefined,
      );
      return this.fetchDomainRows(
        entity.entitySet,
        select,
        filter,
        `${valueField.name} desc`,
        resolvedCodes.length > 0 && fields.identity
          ? (row) => {
              const value = String(row[fields.identity!.name] ?? '');
              const matchesCode = resolvedCodes.some(
                (code) => value === code || value.startsWith(`${code} :`),
              );
              return matchesCode && localPredicate(row);
            }
          : localPredicate,
        context,
      );
    };

    let scanResult = await scanFor(true);
    let effectivePeriod = range.label;
    const periodNotes: string[] = [
      ...(resolvedCodes.length > 0
        ? [`Resolved the product name to ${resolvedCodes.length} verified product record(s) before analysing transactions.`]
        : []),
    ];
    // Demo/legacy environments often contain historical records but none in a
    // recent window. Fall back to all available records, clearly labelled,
    // rather than presenting a misleading zero.
    if (usePeriod && scanResult.rows.length === 0) {
      // If the server-side filter was rejected, fetchDomainRows already scanned
      // the unfiltered records. Reuse them instead of paying for a second
      // full pagination pass.
      const allTimeRows =
        scanResult.serverFiltered === false
          ? scanResult.allRows.filter(productOnlyPredicate)
          : (await scanFor(false)).rows;
      if (allTimeRows.length > 0) {
        scanResult = {
          ...scanResult,
          rows: allTimeRows,
          filter: undefined,
          serverFiltered: false,
        };
        effectivePeriod = 'all available recorded history';
        periodNotes.push(
          `No records were found in ${range.label}. The figures below cover ${effectivePeriod} instead; verify the period before using them as a current result.`,
        );
      }
    }
    const filter = scanResult.filter;
    const rows = scanResult.rows;
    const warnings = compatibilityWarnings(
      rows.map((row) => ({
        ...(fields.currency ? { currency: row[fields.currency.name] as string | null } : {}),
        ...(fields.unit ? { unit: row[fields.unit.name] as string | null } : {}),
      })),
    );
    const ranking = rankBySum(rows, {
      keyField: keyField.name,
      valueField: valueField.name,
      limit: topN,
      ...(labelField ? { labelField: labelField.name } : {}),
      ...(category === 'returns' ? { absoluteValue: true } : {}),
      ...(category === 'inventory' ? { ascending: true } : {}),
    });
    // Enrich code-only results with real business names from verified product records.
    if (ranking.items.some((item) => !item.label || item.label === '(unspecified)')) {
      const names = await this.loadProductNames(context);
      for (const item of ranking.items) {
        if (item.label && item.label !== '(unspecified)') continue;
        const name = names.get(item.key.split(' :')[0]);
        if (name) item.label = name;
      }
    }
    // The contribution denominator is the whole matching population, not just
    // the displayed top-N, so a leader never appears to be 100% by default.
    const total =
      Math.round(
        rows.reduce((sum, row) => {
          const raw = row[valueField.name];
          const value = typeof raw === 'string' ? Number(raw) : raw;
          const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
          return sum + (category === 'returns' ? Math.abs(numeric) : numeric);
        }, 0) * 100,
      ) / 100;
    const leader = ranking.items[0];
    const contribution = leader
      ? salesContribution(leader.value, total, {
          productLabel: leader.label ?? leader.key,
          measureLabel: category === 'returns' ? 'returns' : category === 'inventory' ? 'stock' : 'sales',
        })
      : undefined;

    const columns: TableColumn[] = [
      { key: 'key', label: 'Business name', type: 'string' },
      { key: 'value', label: 'Measured value', type: 'number' },
      { key: 'count', label: 'Records', type: 'number' },
    ];
    context.collector.addAttachment({
      type: 'table',
      id: `${context.toolCallId}-ranking-${category}`,
      title: `${category} ranking`,
      columns,
      rows: ranking.items.map((item) => ({
        key: item.label || item.key,
        value: item.value,
        count: item.count,
      })) as Record<string, CellValue>[],
      truncated: !scanResult.complete || ranking.truncated,
    });
    if (leader && contribution?.valid) {
      context.collector.addAttachment({
        type: 'metric',
        id: `${context.toolCallId}-summary-${category}`,
        title: `${category} summary`,
        items: [
          { label: 'Top result', value: leader.label ?? leader.key },
          { label: 'Top value', value: numberText(leader.value) },
          { label: 'Total measured value', value: numberText(total) },
          { label: 'Top share of total', value: `${contribution.percent}%` },
          { label: 'Data status', value: scanResult.complete ? 'complete' : 'partial' },
        ],
      });
    }

    const notes = [
      ...periodNotes,
      ...warningStringsFor(category, effectivePeriod, explicitPeriod),
      ...ranking.warnings,
      ...warnings,
      ...scanResult.notes,
      ...(scanResult.complete
        ? []
        : ['Only a bounded portion of matching records was scanned; figures must be described as partial.']),
      ...(rows.length === 0
        ? ['No records matched this request. This is a genuine no-record result, not a failed request.']
        : []),
    ];

    context.collector.addSource({
      entitySet: scanResult.entitySet,
      entityType: scanResult.entityType,
      operation: `${category}_summary`,
      ...(filter ? { filter } : {}),
      rowsReturned: rows.length,
      complete: scanResult.complete,
      ...(notes.length > 0 ? { notes } : {}),
    });
    context.collector.addDataContext({
      entitySet: scanResult.entitySet,
      entityType: scanResult.entityType,
      operation: `${category}_summary`,
      select,
      ...(filter ? { filter } : {}),
      rowsReturned: rows.length,
      complete: scanResult.complete,
      capturedAt: new Date().toISOString(),
      summary: { total, leader: leader?.key ?? null, topValue: leader?.value ?? null },
    });

    return {
      content: {
        businessArea: category,
        period: effectivePeriod,
        productResolution: resolvedCodes.length > 0 ? { searchTerm: productTerm, matchedCodes: resolvedCodes } : null,
        entitySet: scanResult.entitySet,
        fieldsUsed: { name: keyField.name, label: labelField?.name ?? null, measure: valueField.name, date: fields.date?.name ?? null },
        filter: filter ?? null,
        recordsScanned: scanResult.scanned,
        recordsUsed: rows.length,
        complete: scanResult.complete,
        serverFiltered: scanResult.serverFiltered,
        totalMeasuredValue: total,
        topResults: ranking.items,
        topResultCount: ranking.totalGroups,
        topContribution: contribution
          ? {
              percent: contribution.percent,
              formula: contribution.formula,
              valid: contribution.valid,
            }
          : null,
        warnings: notes,
      },
      meta: { entitySet: scanResult.entitySet, fields: select, rows: rows.length, complete: scanResult.complete },
    };
  }

  private getSalesSummaryTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'get_sales_summary',
          description:
            'Deterministic sales analysis over real ERP records: totals and ranked products by sales value. Use for sales, revenue, top products, product contribution or period sales questions. Reads only verified data and never performs model-side arithmetic.',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The business question.' },
              productTerm: { type: 'string', description: 'Optional product name or code to restrict the analysis.' },
              months: { type: 'integer', minimum: 1, maximum: 60, description: 'Look-back months when no explicit dates.' },
              from: { type: 'string', description: 'Optional start date (ISO).' },
              to: { type: 'string', description: 'Optional end date (ISO).' },
              topN: { type: 'integer', minimum: 1, maximum: 25, description: 'Number of ranked results (default 10).' },
            },
            required: [],
          },
        },
      },
      execute: async (rawArgs, context) => this.runDomainSummary('sales', asObject(rawArgs), context),
    };
  }

  private getInventorySummaryTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'get_inventory_summary',
          description:
            'Deterministic inventory analysis over real ERP records: on-hand/available quantities ranked by product, optionally restricted to a product name. Use for stock, availability and low-inventory questions.',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The business question.' },
              productTerm: { type: 'string', description: 'Optional product name or code.' },
              topN: { type: 'integer', minimum: 1, maximum: 25, description: 'Number of ranked results (default 10).' },
            },
            required: [],
          },
        },
      },
      execute: async (rawArgs, context) => this.runDomainSummary('inventory', asObject(rawArgs), context),
    };
  }

  private getReturnsSummaryTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'get_returns_summary',
          description:
            'Deterministic returns analysis over real ERP records: returned products ranked by returned quantity, optionally by product and period. Use for most-returned products and return-trend questions.',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The business question.' },
              productTerm: { type: 'string', description: 'Optional product name or code.' },
              months: { type: 'integer', minimum: 1, maximum: 60, description: 'Look-back months when no explicit dates.' },
              from: { type: 'string', description: 'Optional start date (ISO).' },
              to: { type: 'string', description: 'Optional end date (ISO).' },
              topN: { type: 'integer', minimum: 1, maximum: 25, description: 'Number of ranked results (default 10).' },
            },
            required: [],
          },
        },
      },
      execute: async (rawArgs, context) => this.runDomainSummary('returns', asObject(rawArgs), context),
    };
  }

  private compareBusinessPeriodsTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'compare_business_periods',
          description:
            'Compares the same verified ERP measure across two explicit date ranges and computes the percentage change deterministically. Use for growth, increase/decrease or period-comparison questions.',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The business question.' },
              category: { type: 'string', enum: ['sales', 'returns', 'inventory'], description: 'Business domain.' },
              productTerm: { type: 'string', description: 'Optional product name or code.' },
              previousFrom: { type: 'string', description: 'Start of the earlier period (ISO).' },
              previousTo: { type: 'string', description: 'End of the earlier period (ISO).' },
              currentFrom: { type: 'string', description: 'Start of the later period (ISO).' },
              currentTo: { type: 'string', description: 'End of the later period (ISO).' },
            },
            required: ['question', 'category', 'previousFrom', 'previousTo', 'currentFrom', 'currentTo'],
          },
        },
      },
      execute: async (rawArgs, context) => {
        const args = asObject(rawArgs);
        const categoryRaw = requireString(args, 'category', { max: 30 });
        if (!['sales', 'returns', 'inventory'].includes(categoryRaw)) {
          throw new ValidationError('Unsupported business domain.');
        }
        const category = categoryRaw as BusinessCategory;
        const previousFrom = requireString(args, 'previousFrom', { max: 40 });
        const previousTo = requireString(args, 'previousTo', { max: 40 });
        const currentFrom = requireString(args, 'currentFrom', { max: 40 });
        const currentTo = requireString(args, 'currentTo', { max: 40 });
        const productTerm = optionalString(args, 'productTerm', { max: 200 });
        const question = optionalString(args, 'question', { max: 400 }) ?? category;

        const entity = await this.resolveFactEntity(category, question);
        const fields = this.detectFields(entity, category);
        const valueField = fields.measure ?? fields.quantity;
        if (!valueField || !fields.date) {
          throw new ValidationError('The verified data source has no dated numeric measure for a period comparison.');
        }
        const productFilter = this.buildProductFilter(fields, productTerm);
        const productField = fields.identity ?? fields.name;
        const accumulate = (rows: Record<string, unknown>[]) => {
          const byProduct = new Map<string, number>();
          const total = rows.reduce((sum, row) => {
            const raw = row[valueField.name];
            const value = typeof raw === 'string' ? Number(raw) : raw;
            const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
            // D365 commonly stores return quantities as negative values. Use
            // the returned magnitude so period trends remain comparable.
            const measured = category === 'returns' ? Math.abs(numeric) : numeric;
            const product = productField
              ? String(row[productField.name] ?? '(unspecified)')
              : '(unspecified)';
            byProduct.set(product, (byProduct.get(product) ?? 0) + measured);
            return sum + measured;
          }, 0);
          return { total: Math.round(total * 100) / 100, byProduct };
        };
        const measureSide = async (from: string, to: string) => {
          const filter = this.combineFilters([
            productFilter,
            this.buildDateFilter(fields.date, from, to),
          ]);
          const scan = await this.fetchDomainRows(
            entity.entitySet,
            [valueField.name, fields.date!.name, fields.identity?.name, fields.name?.name]
              .filter((value): value is string => Boolean(value)),
            filter,
            undefined,
            this.buildLocalPredicate(fields, productTerm, from, to),
            context,
          );
          const { total, byProduct } = accumulate(scan.rows);
          return {
            filter,
            total,
            rows: scan.rows.length,
            complete: scan.complete,
            notes: scan.notes,
            byProduct,
          };
        };

        context.emitStatus(status('analyzing_data', { tool: 'compare_business_periods', entitySet: entity.entitySet }));
        let [previous, current] = await Promise.all([
          measureSide(previousFrom, previousTo),
          measureSide(currentFrom, currentTo),
        ]);
        let previousRange = {
          from: previousFrom.slice(0, 10),
          to: previousTo.slice(0, 10),
        };
        let currentRange = {
          from: currentFrom.slice(0, 10),
          to: currentTo.slice(0, 10),
        };
        let historicalFallbackNote: string | undefined;
        let comparisonComparable = true;

        // Demo environments often contain historical records but none in the
        // requested recent periods. Compare the two most recent recorded
        // periods instead of asking the user for another date range.
        if ([...previous.byProduct.keys(), ...current.byProduct.keys()].length === 0) {
          const historicalScan = await this.fetchDomainRows(
            entity.entitySet,
            [valueField.name, fields.date!.name, productField?.name]
              .filter((value): value is string => Boolean(value)),
            undefined,
            undefined,
            this.buildLocalPredicate(fields, productTerm, undefined, undefined),
            context,
          );
          const buckets = new Map<string, Record<string, unknown>[]>();
          const addToBucket = (key: string, row: Record<string, unknown>) => {
            const bucket = buckets.get(key);
            if (bucket) bucket.push(row);
            else buckets.set(key, [row]);
          };
          for (const row of historicalScan.rows) {
            const raw = row[fields.date!.name];
            const time = raw === null || raw === undefined || raw === '' ? Number.NaN : Date.parse(String(raw));
            if (!Number.isFinite(time)) continue;
            const date = new Date(time);
            addToBucket(
              `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
              row,
            );
          }
          let bucketKind: 'month' | 'year' = 'month';
          if (buckets.size < 2) {
            buckets.clear();
            bucketKind = 'year';
            for (const row of historicalScan.rows) {
              const raw = row[fields.date!.name];
              const time = raw === null || raw === undefined || raw === '' ? Number.NaN : Date.parse(String(raw));
              if (!Number.isFinite(time)) continue;
              addToBucket(String(new Date(time).getUTCFullYear()), row);
            }
          }
          const keys = [...buckets.keys()].sort();
          const labelFor = (key: string) => {
            if (bucketKind === 'month') {
              const [year, month] = key.split('-').map(Number);
              const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
              const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
              return { from, to };
            }
            return { from: `${key}-01-01`, to: `${key}-12-31` };
          };
          if (keys.length >= 2) {
            const [earlierKey, laterKey] = keys.slice(-2);
            const earlierRange = labelFor(earlierKey);
            const laterRange = labelFor(laterKey);
            const earlierRows = buckets.get(earlierKey) ?? [];
            const laterRows = buckets.get(laterKey) ?? [];
            const earlier = accumulate(earlierRows);
            const later = accumulate(laterRows);
            previous = {
              filter: productFilter,
              total: earlier.total,
              rows: earlierRows.length,
              complete: historicalScan.complete,
              notes: historicalScan.notes,
              byProduct: earlier.byProduct,
            };
            current = {
              filter: productFilter,
              total: later.total,
              rows: laterRows.length,
              complete: historicalScan.complete,
              notes: historicalScan.notes,
              byProduct: later.byProduct,
            };
            previousRange = earlierRange;
            currentRange = laterRange;
            historicalFallbackNote =
              `No records were found in the requested periods (${previousFrom.slice(0, 10)} to ${currentTo.slice(0, 10)}). ` +
              `The figures below compare the two most recent recorded periods with data: ${earlierRange.from} to ${earlierRange.to} and ${laterRange.from} to ${laterRange.to}.`;
          } else if (keys.length === 1) {
            const onlyRange = labelFor(keys[0]);
            const onlyRows = buckets.get(keys[0]) ?? [];
            const onlyTotal = accumulate(onlyRows);
            previous = {
              filter: productFilter,
              total: 0,
              rows: 0,
              complete: historicalScan.complete,
              notes: [],
              byProduct: new Map(),
            };
            current = {
              filter: productFilter,
              total: onlyTotal.total,
              rows: onlyRows.length,
              complete: historicalScan.complete,
              notes: historicalScan.notes,
              byProduct: onlyTotal.byProduct,
            };
            previousRange = onlyRange;
            currentRange = onlyRange;
            comparisonComparable = false;
            historicalFallbackNote =
              `No records were found in the requested periods (${previousFrom.slice(0, 10)} to ${currentTo.slice(0, 10)}). ` +
              `All available recorded history falls in a single recorded period (${onlyRange.from} to ${onlyRange.to}); an earlier/later comparison is not possible. ` +
              `The figures show total measured value by product for that period.`;
          }
        }
        const growth = growthPercent(current.total, previous.total);
        const productKeys = new Set([...previous.byProduct.keys(), ...current.byProduct.keys()]);
        const productChanges = [...productKeys].map((product) => {
          const earlier = previous.byProduct.get(product) ?? 0;
          const later = current.byProduct.get(product) ?? 0;
          const change = growthPercent(later, earlier);
          return {
            product,
            previous: Math.round(earlier * 100) / 100,
            current: Math.round(later * 100) / 100,
            amount: Math.round((later - earlier) * 100) / 100,
            percent: change.percent,
            valid: change.valid,
          };
        });
        const increases = productChanges
          .filter((item) => item.valid && item.amount > 0)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 10);
        const decreases = productChanges
          .filter((item) => item.valid && item.amount < 0)
          .sort((a, b) => a.amount - b.amount)
          .slice(0, 5);
        const productTotals = [...productKeys]
          .map((product) => ({ product, value: current.byProduct.get(product) ?? 0 }))
          .sort((a, b) => b.value - a.value);
        const notes = [
          ...(historicalFallbackNote ? [historicalFallbackNote] : []),
          `Earlier period: ${previousRange.from} to ${previousRange.to}.`,
          `Later period: ${currentRange.from} to ${currentRange.to}.`,
          ...(previous.complete && current.complete
            ? []
            : ['One or both periods were only partially scanned; figures must not be presented as complete.']),
          ...previous.notes,
          ...current.notes,
          ...growth.warnings,
          ...(productKeys.size === 0
            ? ['No records were found in either period. This is a genuine no-record result, not a failed request.']
            : [`Compared ${productKeys.size} product(s) across the two periods.`]),
          ...(!comparisonComparable && productKeys.size > 0
            ? ['An earlier/later increase cannot be determined because the available records fall in one period.']
            : productKeys.size > 0 && increases.length === 0
              ? ['No product had a higher measured value in the later period.']
              : []),
        ];
        const select = [valueField.name, fields.date!.name, productField?.name]
          .filter((value): value is string => Boolean(value));
        const rowsReturned = previous.rows + current.rows;
        const complete = previous.complete && current.complete;
        context.collector.addSource({
          entitySet: entity.entitySet,
          entityType: entity.entityType,
          operation: 'period_comparison',
          rowsReturned,
          complete,
          notes,
        });
        context.collector.addDataContext({
          entitySet: entity.entitySet,
          entityType: entity.entityType,
          operation: 'period_comparison',
          select,
          rowsReturned,
          complete,
          capturedAt: new Date().toISOString(),
          summary: { previous: previous.total, current: current.total, change: growth.percent },
        });
        if (increases.length > 0) {
          context.collector.addAttachment({
            type: 'table',
            id: `${context.toolCallId}-increases`,
            title: `${category} increases`,
            rows: increases.map((item) => ({
              key: item.product,
              previous: item.previous,
              current: item.current,
              change: item.amount,
            })),
            columns: [
              { key: 'key', label: 'Product' },
              { key: 'previous', label: 'Earlier period' },
              { key: 'current', label: 'Later period' },
              { key: 'change', label: 'Increase' },
            ],
            truncated: increases.length >= 10 || !complete,
          });
        } else if (!comparisonComparable && productTotals.length > 0) {
          context.collector.addAttachment({
            type: 'table',
            id: `${context.toolCallId}-totals`,
            title: `${category} recorded totals`,
            rows: productTotals.map((item) => ({
              key: item.product,
              value: item.value,
            })),
            columns: [
              { key: 'key', label: 'Product' },
              { key: 'value', label: 'Recorded total' },
            ],
            truncated: !complete || productTotals.length > 20,
          });
        } else {
          context.collector.addAttachment({
            type: 'metric',
            id: `${context.toolCallId}-comparison`,
            title: `${category} period comparison`,
            items: [
              { label: 'Earlier period total', value: numberText(previous.total) },
              { label: 'Later period total', value: numberText(current.total) },
              { label: 'Change', value: growth.valid ? `${growth.percent}%` : 'Not comparable' },
              { label: 'Products compared', value: numberText(productKeys.size) },
              { label: 'Data status', value: complete ? 'complete' : 'partial' },
            ],
          });
        }
        return {
          content: {
            businessArea: category,
            entitySet: entity.entitySet,
            measureField: valueField.name,
            previous: { total: previous.total, records: previous.rows, complete: previous.complete },
            current: { total: current.total, records: current.rows, complete: current.complete },
            previousRange,
            currentRange,
            historicalFallback: Boolean(historicalFallbackNote),
            requestedRange: {
              previous: { from: previousFrom.slice(0, 10), to: previousTo.slice(0, 10) },
              current: { from: currentFrom.slice(0, 10), to: currentTo.slice(0, 10) },
            },
            change: {
              amount: Math.round((current.total - previous.total) * 100) / 100,
              percent: growth.percent,
              formula: growth.formula,
              valid: growth.valid,
            },
            productsCompared: productKeys.size,
            comparisonComparable,
            productTotals,
            increases,
            decreases,
            warnings: notes,
          },
          meta: { entitySet: entity.entitySet, fields: [valueField.name], rows: rowsReturned },
        };
      },
    };
  }

  private analyzeBusinessMetricsTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'analyze_business_metrics',
          description:
            'Calculates a business ratio from two verified figures supplied by earlier ERP tools: sales contribution, return rate or growth. Never invent the input figures; they must come from tool results. Uses a defined denominator and refuses division by zero.',
          parameters: {
            type: 'object',
            properties: {
              metric: { type: 'string', enum: ['sales_contribution', 'return_rate', 'growth'] },
              numerator: { type: 'number', description: 'Verified numerator figure.' },
              denominator: { type: 'number', description: 'Verified denominator figure.' },
              label: { type: 'string', description: 'Optional business label for the numerator.' },
            },
            required: ['metric', 'numerator', 'denominator'],
          },
        },
      },
      execute: async (rawArgs) => {
        const args = asObject(rawArgs);
        const metric = requireString(args, 'metric', { max: 40 });
        const numerator = args.numerator;
        const denominator = args.denominator;
        if (typeof numerator !== 'number' || typeof denominator !== 'number') {
          throw new ValidationError('Both figures must be numbers returned by an ERP tool.');
        }
        const label = optionalString(args, 'label', { max: 120 });
        let result;
        if (metric === 'sales_contribution') {
          result = salesContribution(numerator, denominator, { productLabel: label });
        } else if (metric === 'return_rate') {
          result = returnRate(numerator, denominator);
        } else if (metric === 'growth') {
          result = growthPercent(numerator, denominator);
        } else {
          throw new ValidationError('Unsupported metric.');
        }
        return {
          content: {
            metric,
            percent: result.percent,
            ratio: result.ratio,
            denominator: result.denominator,
            formula: result.formula,
            valid: result.valid,
            warnings: result.warnings,
            note: result.valid
              ? 'Calculated deterministically from the supplied verified figures.'
              : 'Calculation could not be completed; explain the data limitation rather than guessing.',
          },
        };
      },
    };
  }

  private buildAnalyticsAttachments(
    result: Awaited<ReturnType<AnalyticsEngine['run']>>,
    context: ToolContext,
  ): void {
    const completeText = result.complete ? 'complete' : 'partial';
    if (result.operation === 'count') {
      context.collector.addAttachment({
        type: 'metric',
        id: `${context.toolCallId}-metric`,
        title: `Count · ${result.entitySet}`,
        subtitle: result.filter,
        items: [
          { label: 'Matching records', value: numberText(result.count ?? result.value) },
          {
            label: 'Data status',
            value: completeText,
            hint:
              result.method === 'server-count'
                ? 'Exact $count from D365'
                : `${result.recordsScanned} record(s) scanned`,
          },
        ],
      });
      return;
    }

    if (result.operation === 'groupBy' && result.groups) {
      const columns: TableColumn[] = [
        { key: 'key', label: result.groupByField ?? 'Group', type: 'string' },
        { key: 'count', label: 'Records', type: 'number' },
      ];
      if (result.aggregateOperation !== 'count') {
        columns.push({
          key: 'value',
          label: `${result.aggregateOperation ?? 'aggregate'} of ${result.field ?? ''}`.trim(),
          type: 'number',
        });
      }
      const tableRows = result.groups.map((group: GroupResult) => ({
        key: group.key,
        count: group.count,
        value: group.value ?? null,
      }));
      context.collector.addAttachment({
        type: 'table',
        id: `${context.toolCallId}-groups`,
        title: `Grouped by ${result.groupByField ?? 'field'} · ${result.entitySet}`,
        ...(result.filter ? { subtitle: result.filter } : {}),
        columns,
        rows: tableRows as Record<string, CellValue>[],
        ...(result.totalMatches !== undefined ? { totalRows: result.totalMatches } : {}),
        truncated: result.groupsTruncated === true || !result.complete,
      });
      const chartGroups = result.groups.filter((group) => typeof group.value === 'number').slice(0, 20);
      if (chartGroups.length > 0) {
        context.collector.addAttachment({
          type: 'chart',
          id: `${context.toolCallId}-chart`,
          title: `${result.aggregateOperation ?? 'count'} by ${result.groupByField ?? 'group'}`,
          chartType: 'bar',
          labels: chartGroups.map((group) => group.key.slice(0, 60)),
          values: chartGroups.map((group) => group.value as number),
          valueLabel: result.field,
          subtitle: result.complete ? undefined : 'Partial data',
        });
      }
      return;
    }

    if (result.operation === 'comparison' && result.comparison) {
      const { left, right, difference, percentageDifference } = result.comparison;
      context.collector.addAttachment({
        type: 'metric',
        id: `${context.toolCallId}-comparison`,
        title: `Comparison · ${result.entitySet}`,
        items: [
          { label: left.label, value: numberText(left.value ?? left.count) },
          { label: right.label, value: numberText(right.value ?? right.count) },
          ...(difference !== undefined ? [{ label: 'Difference', value: numberText(difference) }] : []),
          ...(percentageDifference !== undefined && percentageDifference !== null
            ? [{ label: 'Difference %', value: `${percentageDifference.toFixed(2)}%` }]
            : []),
          { label: 'Data status', value: completeText },
        ],
      });
      const leftValue = typeof left.value === 'number' ? left.value : left.count;
      const rightValue = typeof right.value === 'number' ? right.value : right.count;
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        context.collector.addAttachment({
          type: 'chart',
          id: `${context.toolCallId}-comparison-chart`,
          title: 'Comparison',
          chartType: 'bar',
          labels: [left.label, right.label],
          values: [leftValue, rightValue],
          subtitle: result.complete ? undefined : 'Partial data',
        });
      }
      return;
    }

    context.collector.addAttachment({
      type: 'metric',
      id: `${context.toolCallId}-metric`,
      title: `${result.operation} of ${result.field ?? 'field'} · ${result.entitySet}`,
      subtitle: result.filter,
      items: [
        { label: result.operation.toUpperCase(), value: numberText(result.value) },
        { label: 'Records used', value: numberText(result.recordsUsed) },
        { label: 'Data status', value: completeText },
        ...(result.nullOrMissing > 0
          ? [{ label: 'Null / missing', value: numberText(result.nullOrMissing) }]
          : []),
      ],
    });
  }
}
