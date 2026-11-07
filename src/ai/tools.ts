import { ValidationError } from '../errors';
import type { AppConfig } from '../config';
import type { Logger } from '../logger';
import type { D365Client } from '../d365/client';
import type { MetadataService } from '../metadata/service';
import type { EntityMetadata, EntityProperty } from '../metadata/types';
import { propertyKind } from '../metadata/types';
import type { QueryBuilder } from '../query/builder';
import type { AnalyticsEngine, AnalyticsOperation, AnalyticsRequest, GroupResult } from '../analytics/analytics';
import {
  type AttachmentCollector,
  type CellValue,
  type TableColumn,
  dataRowsFromOData,
} from './attachments';
import type { AIToolDefinition } from './types';
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

const TOOL_TIMEOUT_MS = 60_000;
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
      label: property.name,
      type: propertyKind(property.type),
      isKey: property.isKey,
    };
  });
}

function orderByToString(entity: EntityMetadata, orderBy: Array<{ field: string; direction: string }>): string | undefined {
  if (orderBy.length === 0) return undefined;
  return orderBy.map((clause) => `${clause.field} ${clause.direction}`).join(', ');
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

  private createTools(): RegisteredTool[] {
    return [
      this.searchEntitiesTool(),
      this.getEntitySchemaTool(),
      this.queryEntityTool(),
      this.analyzeDataTool(),
      this.getRelatedEntitiesTool(),
    ];
  }

  private searchEntitiesTool(): RegisteredTool {
    return {
      definition: {
        type: 'function',
        function: {
          name: 'searchEntities',
          description:
            'Search the live D365 metadata catalog for EntitySets relevant to a business question. Use this before querying an entity you are not certain about. Searches entity names and field names in English or Arabic business terminology. Returns actual EntitySet names only.',
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
            'Inspect live fields, keys and relationships. Call only when field names are needed; query tools validate fields themselves.',
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
            'Return actual navigation relationships (outgoing and incoming) from D365 metadata for one EntitySet. Use it to discover related data; never invent relationship names.',
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
