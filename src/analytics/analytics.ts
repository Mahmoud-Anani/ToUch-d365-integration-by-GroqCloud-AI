import { ValidationError } from '../errors';
import type { AppConfig } from '../config';
import type { D365Client } from '../d365/client';
import type { EntityProperty } from '../metadata/types';
import { isNumericProperty, propertyKind } from '../metadata/types';
import type { MetadataService } from '../metadata/service';
import type { QueryBuilder } from '../query/builder';

export type AnalyticsOperation = 'count' | 'sum' | 'average' | 'min' | 'max' | 'groupBy' | 'comparison';

export interface AnalyticsRequest {
  operation: AnalyticsOperation;
  entityName: string;
  field?: string;
  aggregateField?: string;
  aggregateOperation?: 'count' | 'sum' | 'average' | 'min' | 'max';
  groupByField?: string;
  filter?: string;
  leftFilter?: string;
  rightFilter?: string;
  leftLabel?: string;
  rightLabel?: string;
  orderBy?: string;
}

export interface GroupResult {
  key: string;
  count: number;
  value?: number | string | null;
}

export interface ComparisonSide {
  label: string;
  filter?: string;
  count?: number;
  value?: number | string | null;
  complete: boolean;
  recordsScanned: number;
}

export interface AnalyticsResult {
  operation: AnalyticsOperation;
  entitySet: string;
  entityType: string;
  filter?: string;
  field?: string;
  groupByField?: string;
  aggregateOperation?: string;
  value?: number | string | null;
  count?: number;
  recordsScanned: number;
  recordsUsed: number;
  nullOrMissing: number;
  complete: boolean;
  totalMatches?: number;
  method: 'server-count' | 'scan';
  groups?: GroupResult[];
  groupCount?: number;
  groupsTruncated?: boolean;
  comparison?: {
    left: ComparisonSide;
    right: ComparisonSide;
    difference?: number;
    percentageDifference?: number | null;
  };
  notes: string[];
}

export interface AnalyticsOptions {
  signal?: AbortSignal;
}

const BLANK_GROUP_LABEL = '(blank)';
const MAX_GROUP_KEY_LENGTH = 200;

function normalizeGroupKey(value: unknown): string {
  if (value === null || value === undefined || value === '') return BLANK_GROUP_LABEL;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_GROUP_KEY_LENGTH ? `${text.slice(0, MAX_GROUP_KEY_LENGTH)}…` : text;
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function aggregateValues(values: Array<number | string>, operation: 'min' | 'max'): number | string | null {
  if (values.length === 0) return null;
  return values.reduce((current, next) =>
    operation === 'min'
      ? compareValues(current, next) <= 0
        ? current
        : next
      : compareValues(current, next) >= 0
        ? current
        : next,
  );
}

function describeRows(scan: { rows: unknown[]; complete: boolean; scanned: number }, maxRows: number): string[] {
  const notes: string[] = [];
  if (scan.scanned === 0) {
    notes.push('No records matched the query. This is a real zero-result, not a failed request.');
  }
  if (!scan.complete) {
    notes.push(
      `Only ${scan.scanned} matching record(s) were scanned (safety limit ${maxRows}). The result is partial and must not be reported as a complete total.`,
    );
  }
  return notes;
}

export class AnalyticsEngine {
  private readonly maxRows: number;
  private readonly maxGroups: number;
  private readonly pageSize: number;

  constructor(
    private readonly client: D365Client,
    private readonly metadata: MetadataService,
    private readonly queryBuilder: QueryBuilder,
    config: AppConfig,
  ) {
    this.maxRows = config.d365.analyticsMaxRows;
    this.maxGroups = config.ai.maxGroups;
    this.pageSize = config.d365.pageSize;
  }

  async run(request: AnalyticsRequest, options: AnalyticsOptions = {}): Promise<AnalyticsResult> {
    const operation = request.operation;
    if (!operation) throw new ValidationError('Analytics operation is required.');

    if (operation === 'count') {
      return this.count(request, options);
    }
    if (operation === 'comparison') {
      return this.comparison(request, options);
    }
    if (operation === 'groupBy') {
      return this.groupBy(request, options);
    }
    return this.singleAggregate(request, options);
  }

  private async entityKeys(entityName: string): Promise<{ entitySet: string; keys: string[] }> {
    const entity = await this.metadata.getEntity(entityName);
    if (!entity) {
      throw new ValidationError(
        `Entity "${entityName}" was not found in the D365 metadata catalog. Use searchEntities first.`,
      );
    }
    return { entitySet: entity.entitySet, keys: entity.keys };
  }

  private async count(request: AnalyticsRequest, options: AnalyticsOptions): Promise<AnalyticsResult> {
    const { entitySet } = await this.entityKeys(request.entityName);
    const query = await this.queryBuilder.validate({
      entityName: request.entityName,
      filter: request.filter,
      top: 1,
      includeCount: true,
    });

    const exact = await this.client.count(entitySet, query.filter, options.signal);
    if (exact !== undefined) {
      return {
        operation: 'count',
        entitySet: query.entity.entitySet,
        entityType: query.entity.entityType,
        ...(query.filter ? { filter: query.filter } : {}),
        value: exact,
        count: exact,
        recordsScanned: 0,
        recordsUsed: 0,
        nullOrMissing: 0,
        complete: true,
        totalMatches: exact,
        method: 'server-count',
        notes:
          exact === 0
            ? ['No records matched the query. This is a real zero-result, not a failed request.']
            : [],
      };
    }

    const scan = await this.client.fetchAllPages(entitySet, this.queryBuilder.toScanParams(query), {
      maxRows: this.maxRows,
      pageSize: this.pageSize,
      signal: options.signal,
    });
    return {
      operation: 'count',
      entitySet: query.entity.entitySet,
      entityType: query.entity.entityType,
      ...(query.filter ? { filter: query.filter } : {}),
      value: scan.scanned,
      count: scan.scanned,
      recordsScanned: scan.scanned,
      recordsUsed: scan.scanned,
      nullOrMissing: 0,
      complete: scan.complete,
      ...(scan.totalMatches !== undefined ? { totalMatches: scan.totalMatches } : {}),
      method: 'scan',
      notes: describeRows(scan, this.maxRows),
    };
  }

  private async singleAggregate(
    request: AnalyticsRequest,
    options: AnalyticsOptions,
  ): Promise<AnalyticsResult> {
    const operation = request.operation as 'sum' | 'average' | 'min' | 'max';
    const fieldName = request.field ?? request.aggregateField;
    if (!fieldName) throw new ValidationError(`Analytics operation "${operation}" requires a field.`);

    const entityKeys = await this.entityKeys(request.entityName);
    const query = await this.queryBuilder.validate({
      entityName: request.entityName,
      select: [fieldName],
      filter: request.filter,
      orderBy: request.orderBy || entityKeys.keys.join(', '),
      top: 1,
      includeCount: true,
    });

    const property = query.entity.properties.find(
      (item) => item.name.toLowerCase() === fieldName.toLowerCase(),
    ) as EntityProperty | undefined;
    if (!property) throw new ValidationError(`Field "${fieldName}" was not found on the entity.`);
    if ((operation === 'sum' || operation === 'average') && !isNumericProperty(property)) {
      throw new ValidationError(`Field "${property.name}" is not numeric; ${operation} requires a numeric field.`);
    }
    if (propertyKind(property.type) === 'binary') {
      throw new ValidationError(`Field "${property.name}" cannot be aggregated.`);
    }

    const scan = await this.client.fetchAllPages(
      query.entity.entitySet,
      this.queryBuilder.toScanParams(query),
      { maxRows: this.maxRows, pageSize: this.pageSize, signal: options.signal },
    );

    let nullOrMissing = 0;
    const numericValues: number[] = [];
    const rawValues: Array<number | string> = [];
    for (const row of scan.rows) {
      const value = row[property.name];
      if (operation === 'sum' || operation === 'average') {
        const number = numericValue(value);
        if (number === null) nullOrMissing += 1;
        else numericValues.push(number);
      } else if (value === null || value === undefined || value === '') {
        nullOrMissing += 1;
      } else if (typeof value === 'number' || typeof value === 'string') {
        rawValues.push(value);
      } else {
        nullOrMissing += 1;
      }
    }

    let resultValue: number | string | null = null;
    if (operation === 'sum') {
      resultValue = numericValues.reduce((total, value) => total + value, 0);
    } else if (operation === 'average') {
      resultValue = numericValues.length
        ? numericValues.reduce((total, value) => total + value, 0) / numericValues.length
        : null;
    } else {
      resultValue = aggregateValues(rawValues, operation);
    }

    return {
      operation,
      entitySet: query.entity.entitySet,
      entityType: query.entity.entityType,
      ...(query.filter ? { filter: query.filter } : {}),
      field: property.name,
      value: resultValue,
      recordsScanned: scan.scanned,
      recordsUsed:
        operation === 'sum' || operation === 'average' ? numericValues.length : rawValues.length,
      nullOrMissing,
      complete: scan.complete,
      ...(scan.totalMatches !== undefined ? { totalMatches: scan.totalMatches } : {}),
      method: 'scan',
      notes: describeRows(scan, this.maxRows),
    };
  }

  private async groupBy(request: AnalyticsRequest, options: AnalyticsOptions): Promise<AnalyticsResult> {
    if (!request.groupByField) throw new ValidationError('groupBy requires groupByField.');
    const aggregateOperation = request.aggregateOperation ?? 'count';
    if (!['count', 'sum', 'average', 'min', 'max'].includes(aggregateOperation)) {
      throw new ValidationError(`Unsupported groupBy aggregate "${aggregateOperation}".`);
    }
    if (aggregateOperation !== 'count' && !request.aggregateField) {
      throw new ValidationError(`groupBy with ${aggregateOperation} requires aggregateField.`);
    }

    const entityKeys = await this.entityKeys(request.entityName);
    const select = [request.groupByField];
    if (aggregateOperation !== 'count' && request.aggregateField) select.push(request.aggregateField);

    const query = await this.queryBuilder.validate({
      entityName: request.entityName,
      select,
      filter: request.filter,
      orderBy: request.orderBy || entityKeys.keys.join(', '),
      top: 1,
      includeCount: true,
    });

    const groupProperty = query.entity.properties.find(
      (item) => item.name.toLowerCase() === request.groupByField?.toLowerCase(),
    );
    if (!groupProperty) throw new ValidationError(`Group field "${request.groupByField}" was not found.`);

    let aggregateProperty: EntityProperty | undefined;
    if (aggregateOperation !== 'count') {
      aggregateProperty = query.entity.properties.find(
        (item) => item.name.toLowerCase() === request.aggregateField?.toLowerCase(),
      );
      if (!aggregateProperty) {
        throw new ValidationError(`Aggregate field "${request.aggregateField}" was not found.`);
      }
      if ((aggregateOperation === 'sum' || aggregateOperation === 'average') && !isNumericProperty(aggregateProperty)) {
        throw new ValidationError(`Aggregate field "${aggregateProperty.name}" must be numeric.`);
      }
    }

    const scan = await this.client.fetchAllPages(
      query.entity.entitySet,
      this.queryBuilder.toScanParams(query),
      { maxRows: this.maxRows, pageSize: this.pageSize, signal: options.signal },
    );

    interface Bucket {
      count: number;
      numbers: number[];
      raw: Array<number | string>;
      nulls: number;
    }
    const buckets = new Map<string, Bucket>();
    let nullOrMissing = 0;

    for (const row of scan.rows) {
      const key = normalizeGroupKey(row[groupProperty.name]);
      const bucket = buckets.get(key) ?? { count: 0, numbers: [], raw: [], nulls: 0 };
      bucket.count += 1;

      if (aggregateOperation !== 'count' && aggregateProperty) {
        const value = row[aggregateProperty.name];
        if (aggregateOperation === 'sum' || aggregateOperation === 'average') {
          const number = numericValue(value);
          if (number === null) {
            bucket.nulls += 1;
            nullOrMissing += 1;
          } else {
            bucket.numbers.push(number);
          }
        } else if (value === null || value === undefined || value === '') {
          bucket.nulls += 1;
          nullOrMissing += 1;
        } else if (typeof value === 'number' || typeof value === 'string') {
          bucket.raw.push(value);
        } else {
          bucket.nulls += 1;
          nullOrMissing += 1;
        }
      }
      buckets.set(key, bucket);
    }

    const groups: GroupResult[] = [...buckets.entries()].map(([key, bucket]) => {
      if (aggregateOperation === 'count') return { key, count: bucket.count, value: bucket.count };
      if (aggregateOperation === 'sum') {
        return {
          key,
          count: bucket.count,
          value: bucket.numbers.reduce((total, value) => total + value, 0),
        };
      }
      if (aggregateOperation === 'average') {
        return {
          key,
          count: bucket.count,
          value: bucket.numbers.length
            ? bucket.numbers.reduce((total, value) => total + value, 0) / bucket.numbers.length
            : null,
        };
      }
      return {
        key,
        count: bucket.count,
        value: aggregateValues(bucket.raw, aggregateOperation as 'min' | 'max'),
      };
    });

    groups.sort((a, b) => {
      const aValue = a.value;
      const bValue = b.value;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        if (bValue !== aValue) return bValue - aValue;
      } else if (aValue !== bValue) {
        return String(bValue ?? '').localeCompare(String(aValue ?? ''));
      }
      return a.key.localeCompare(b.key);
    });

    const groupCount = groups.length;
    const limited = groups.slice(0, Math.max(1, this.maxGroups));
    const notes = describeRows(scan, this.maxRows);
    if (groupCount > limited.length) {
      notes.push(`Showing the top ${limited.length} of ${groupCount} groups.`);
    }

    return {
      operation: 'groupBy',
      entitySet: query.entity.entitySet,
      entityType: query.entity.entityType,
      ...(query.filter ? { filter: query.filter } : {}),
      groupByField: groupProperty.name,
      aggregateOperation,
      ...(aggregateProperty ? { field: aggregateProperty.name } : {}),
      recordsScanned: scan.scanned,
      recordsUsed: scan.scanned,
      nullOrMissing,
      complete: scan.complete,
      ...(scan.totalMatches !== undefined ? { totalMatches: scan.totalMatches } : {}),
      method: 'scan',
      groups: limited,
      groupCount,
      groupsTruncated: groupCount > limited.length,
      notes,
    };
  }

  private async comparison(
    request: AnalyticsRequest,
    options: AnalyticsOptions,
  ): Promise<AnalyticsResult> {
    const { entitySet } = await this.entityKeys(request.entityName);
    const aggregateOperation = request.aggregateOperation ?? 'count';
    if (!['count', 'sum', 'average', 'min', 'max'].includes(aggregateOperation)) {
      throw new ValidationError(`Unsupported comparison aggregate "${aggregateOperation}".`);
    }
    if (aggregateOperation !== 'count' && !request.field) {
      throw new ValidationError(`Comparison with ${aggregateOperation} requires field.`);
    }

    const compute = async (
      label: string,
      filter: string | undefined,
      suffix: string,
    ): Promise<ComparisonSide> => {
      const query = await this.queryBuilder.validate({
        entityName: request.entityName,
        select: request.field ? [request.field] : undefined,
        filter,
        orderBy: request.orderBy || (await this.entityKeys(request.entityName)).keys.join(', '),
        top: 1,
        includeCount: true,
      });
      if (aggregateOperation === 'count') {
        const exact = await this.client.count(entitySet, query.filter, options.signal);
        if (exact !== undefined) {
          return {
            label,
            ...(query.filter ? { filter: query.filter } : {}),
            count: exact,
            value: exact,
            complete: true,
            recordsScanned: 0,
          };
        }
      }
      const scan = await this.client.fetchAllPages(
        query.entity.entitySet,
        this.queryBuilder.toScanParams(query),
        { maxRows: this.maxRows, pageSize: this.pageSize, signal: options.signal },
      );
      if (aggregateOperation === 'count') {
        return {
          label,
          ...(query.filter ? { filter: query.filter } : {}),
          count: scan.scanned,
          value: scan.scanned,
          complete: scan.complete,
          recordsScanned: scan.scanned,
        };
      }
      const fieldName = query.select.find((field) => field.toLowerCase() === request.field?.toLowerCase()) ?? request.field;
      const numbers: number[] = [];
      const raw: Array<number | string> = [];
      for (const row of scan.rows) {
        const value = fieldName ? row[fieldName] : undefined;
        if (aggregateOperation === 'sum' || aggregateOperation === 'average') {
          const number = numericValue(value);
          if (number !== null) numbers.push(number);
        } else if (typeof value === 'number' || typeof value === 'string') {
          raw.push(value);
        }
      }
      let value: number | string | null = null;
      if (aggregateOperation === 'sum') value = numbers.reduce((total, item) => total + item, 0);
      else if (aggregateOperation === 'average') value = numbers.length ? numbers.reduce((total, item) => total + item, 0) / numbers.length : null;
      else value = aggregateValues(raw, aggregateOperation as 'min' | 'max');
      return {
        label,
        ...(query.filter ? { filter: query.filter } : {}),
        ...(suffix ? {} : {}),
        value,
        complete: scan.complete,
        recordsScanned: scan.scanned,
      };
    };

    const left = await compute(request.leftLabel ?? 'A', request.leftFilter, 'left');
    const right = await compute(request.rightLabel ?? 'B', request.rightFilter, 'right');
    const leftValue = numericValue(left.value);
    const rightValue = numericValue(right.value);
    const difference =
      leftValue !== null && rightValue !== null ? leftValue - rightValue : undefined;
    const percentageDifference =
      leftValue !== null && rightValue !== null && rightValue !== 0
        ? ((leftValue - rightValue) / Math.abs(rightValue)) * 100
        : leftValue !== null && rightValue === 0
          ? null
          : undefined;

    return {
      operation: 'comparison',
      entitySet,
      entityType: (await this.metadata.getEntity(request.entityName))?.entityType ?? '',
      aggregateOperation,
      ...(request.field ? { field: request.field } : {}),
      recordsScanned: left.recordsScanned + right.recordsScanned,
      recordsUsed: left.recordsScanned + right.recordsScanned,
      nullOrMissing: 0,
      complete: left.complete && right.complete,
      method: aggregateOperation === 'count' && left.recordsScanned === 0 && right.recordsScanned === 0 ? 'server-count' : 'scan',
      comparison: {
        left,
        right,
        ...(difference !== undefined ? { difference } : {}),
        ...(percentageDifference !== undefined ? { percentageDifference } : {}),
      },
      notes: [
        ...(left.complete && right.complete
          ? []
          : ['At least one comparison side is partial; the comparison must not be presented as complete.']),
      ],
    };
  }
}
