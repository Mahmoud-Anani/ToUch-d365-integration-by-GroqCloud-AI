import { ForbiddenError, ValidationError } from '../errors';
import type { AppConfig } from '../config';
import type { MetadataService } from '../metadata/service';
import type { EntityMetadata, EntityProperty } from '../metadata/types';
import { isQueryableProperty } from '../metadata/types';
import { buildFilter } from './filter';

export interface QuerySpec {
  entityName: string;
  select?: string[];
  filter?: string;
  orderBy?: string | string[];
  top?: number;
  skip?: number;
  expand?: string[];
  includeCount?: boolean;
}

export interface OrderByClause {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ValidatedQuery {
  entity: EntityMetadata;
  select: string[];
  filter?: string;
  orderBy: OrderByClause[];
  top: number;
  skip: number;
  expand: string[];
  includeCount: boolean;
  params: Record<string, string>;
  notes: string[];
  autoSelected: boolean;
  clamped: boolean;
}

export interface QueryBuilderOptions {
  maxResultRows: number;
  includeCount: boolean;
  entityAllowlist: string[];
  entityDenylist: string[];
  fieldAllowlist: string[];
  fieldDenylist: string[];
}

const MAX_SELECT_FIELDS = 25;
const MAX_ORDER_BY_FIELDS = 10;
const MAX_SKIP = 100_000;
const DEFAULT_TOP = 25;

export function matchesPattern(value: string, patterns: string[]): boolean {
  const lowered = value.toLowerCase();
  return patterns.some((pattern) => {
    const normalized = pattern.trim().toLowerCase();
    if (!normalized) return false;
    if (!normalized.includes('*')) return normalized === lowered;
    const regex = new RegExp(
      `^${normalized
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`,
      'i',
    );
    return regex.test(value);
  });
}

export class QueryBuilder {
  private readonly options: QueryBuilderOptions;

  constructor(
    private readonly metadata: MetadataService,
    config: AppConfig,
  ) {
    this.options = {
      maxResultRows: config.ai.maxResultRows,
      includeCount: config.d365.includeCount,
      entityAllowlist: config.d365.entityAllowlist,
      entityDenylist: config.d365.entityDenylist,
      fieldAllowlist: config.d365.fieldAllowlist,
      fieldDenylist: config.d365.fieldDenylist,
    };
  }

  async validate(spec: QuerySpec): Promise<ValidatedQuery> {
    const entity = await this.metadata.getEntity(spec.entityName ?? '');
    if (!entity) {
      throw new ValidationError(
        `Entity "${spec.entityName}" was not found in the D365 metadata catalog. Use searchEntities to find the correct EntitySet name.`,
      );
    }
    if (!entity.metadataAvailable) {
      throw new ValidationError(
        `Entity "${entity.entitySet}" is advertised by D365 but has no field metadata, so it cannot be queried safely.`,
      );
    }
    this.assertEntityAllowed(entity);

    const notes: string[] = [];
    let clamped = false;

    const selected = this.resolveSelect(entity, spec.select, notes);
    const filter = spec.filter?.trim()
      ? buildFilter(spec.filter, (name) => this.resolveAuthorizedField(entity, name))
      : undefined;

    const orderBy = this.parseOrderBy(entity, spec.orderBy, notes);
    if (orderBy.length !== this.normalizeOrderByInput(spec.orderBy).length) clamped = true;

    let top = spec.top === undefined ? Math.min(DEFAULT_TOP, this.options.maxResultRows) : Math.trunc(spec.top);
    if (!Number.isFinite(top) || top < 1) top = 1;
    if (top > this.options.maxResultRows) {
      top = this.options.maxResultRows;
      notes.push(`top was limited to the configured maximum of ${this.options.maxResultRows} rows.`);
      clamped = true;
    }

    let skip = spec.skip === undefined ? 0 : Math.trunc(spec.skip);
    if (!Number.isFinite(skip) || skip < 0) skip = 0;
    if (skip > MAX_SKIP) {
      skip = MAX_SKIP;
      notes.push(`skip was limited to ${MAX_SKIP}.`);
      clamped = true;
    }

    const expand = this.resolveExpand(entity, spec.expand);
    const includeCount = spec.includeCount ?? this.options.includeCount;

    const params: Record<string, string> = {
      $select: selected.fields.join(','),
      $top: String(top),
    };
    if (filter) params.$filter = filter;
    if (orderBy.length > 0) {
      params.$orderby = orderBy.map((clause) => `${clause.field} ${clause.direction}`).join(',');
    }
    if (skip > 0) params.$skip = String(skip);
    if (expand.length > 0) params.$expand = expand.join(',');
    if (includeCount) params.$count = 'true';

    return {
      entity,
      select: selected.fields,
      ...(filter ? { filter } : {}),
      orderBy,
      top,
      skip,
      expand,
      includeCount,
      params,
      notes,
      autoSelected: selected.autoSelected,
      clamped,
    };
  }

  /** Parameters for a full scan; $top/$skip are managed by the client pager. */
  toScanParams(query: ValidatedQuery): Record<string, string> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query.params)) {
      if (key !== '$top' && key !== '$skip') params[key] = value;
    }
    params.$count = 'true';
    return params;
  }

  private assertEntityAllowed(entity: EntityMetadata): void {
    const deny = this.options.entityDenylist;
    if (
      matchesPattern(entity.entitySet, deny) ||
      (entity.entityTypeShort && matchesPattern(entity.entityTypeShort, deny))
    ) {
      throw new ForbiddenError(`Access to entity "${entity.entitySet}" is blocked by policy.`);
    }
    if (this.options.entityAllowlist.length > 0) {
      const allowed =
        matchesPattern(entity.entitySet, this.options.entityAllowlist) ||
        (entity.entityTypeShort && matchesPattern(entity.entityTypeShort, this.options.entityAllowlist));
      if (!allowed) {
        throw new ForbiddenError(`Access to entity "${entity.entitySet}" is not allowed by policy.`);
      }
    }
  }

  private fieldPolicy(property: EntityProperty): 'ok' | 'denied' | 'not-allowed' {
    if (matchesPattern(property.name, this.options.fieldDenylist)) return 'denied';
    if (
      this.options.fieldAllowlist.length > 0 &&
      !matchesPattern(property.name, this.options.fieldAllowlist)
    ) {
      return 'not-allowed';
    }
    return 'ok';
  }

  private assertFieldAllowed(property: EntityProperty): void {
    const policy = this.fieldPolicy(property);
    if (policy === 'denied') {
      throw new ForbiddenError(`Field "${property.name}" is blocked by data policy.`);
    }
    if (policy === 'not-allowed') {
      throw new ForbiddenError(`Field "${property.name}" is not allowed by data policy.`);
    }
  }

  private isFieldAllowed(property: EntityProperty): boolean {
    return this.fieldPolicy(property) === 'ok';
  }

  private resolveAuthorizedField(entity: EntityMetadata, name: string): EntityProperty {
    const property = entity.properties.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!property) {
      throw new ValidationError(
        `Field "${name}" does not exist on entity "${entity.entitySet}". Use getEntitySchema to inspect its fields.`,
      );
    }
    this.assertFieldAllowed(property);
    if (!isQueryableProperty(property)) {
      throw new ValidationError(`Field "${property.name}" is not queryable.`);
    }
    return property;
  }

  private resolveSelect(
    entity: EntityMetadata,
    requested: string[] | undefined,
    notes: string[],
  ): { fields: string[]; autoSelected: boolean } {
    const autoSelected = !requested || requested.length === 0;
    let fields: string[];

    if (autoSelected) {
      const keys = entity.properties.filter(
        (property) => property.isKey && this.isFieldAllowed(property),
      );
      const candidates = entity.properties.filter(
        (property) =>
          (property.isKey || (isQueryableProperty(property) && !property.isCollection)) &&
          this.isFieldAllowed(property),
      );
      fields = [...keys, ...candidates.filter((property) => !property.isKey)]
        .slice(0, Math.min(MAX_SELECT_FIELDS, Math.max(10, keys.length + 6)))
        .map((property) => property.name);
      notes.push(
        `select was omitted; auto-selected ${fields.length} fields (keys plus the first available fields).`,
      );
    } else {
      if (requested.length > MAX_SELECT_FIELDS) {
        notes.push(`select was limited to ${MAX_SELECT_FIELDS} fields.`);
      }
      fields = requested.slice(0, MAX_SELECT_FIELDS).map((name) => this.resolveAuthorizedField(entity, name).name);
    }

    // Keys are always useful for follow-up queries and grounding.
    for (const key of entity.keys) {
      if (!fields.some((field) => field.toLowerCase() === key.toLowerCase())) {
        const property = entity.properties.find((item) => item.name.toLowerCase() === key.toLowerCase());
        if (property) {
          this.assertFieldAllowed(property);
          fields.push(property.name);
        }
      }
    }

    const unique = fields.filter((field, index) => fields.findIndex((item) => item.toLowerCase() === field.toLowerCase()) === index);
    return { fields: unique.slice(0, MAX_SELECT_FIELDS), autoSelected };
  }

  private normalizeOrderByInput(orderBy: string | string[] | undefined): string[] {
    if (!orderBy) return [];
    const raw = Array.isArray(orderBy) ? orderBy : [orderBy];
    return raw
      .flatMap((item) => item.split(','))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parseOrderBy(
    entity: EntityMetadata,
    orderBy: string | string[] | undefined,
    notes: string[],
  ): OrderByClause[] {
    const raw = this.normalizeOrderByInput(orderBy);
    if (raw.length === 0) return [];
    if (raw.length > MAX_ORDER_BY_FIELDS) {
      notes.push(`orderBy was limited to ${MAX_ORDER_BY_FIELDS} fields.`);
    }
    const clauses: OrderByClause[] = [];
    const seen = new Set<string>();
    for (const item of raw.slice(0, MAX_ORDER_BY_FIELDS)) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(asc|desc))?$/i.exec(item);
      if (!match) {
        throw new ValidationError(
          `Invalid orderBy clause "${item}". Use "FieldName" or "FieldName asc|desc".`,
        );
      }
      const property = this.resolveAuthorizedField(entity, match[1] as string);
      if (seen.has(property.name.toLowerCase())) continue;
      seen.add(property.name.toLowerCase());
      clauses.push({
        field: property.name,
        direction: (match[2]?.toLowerCase() as 'asc' | 'desc' | undefined) ?? 'asc',
      });
    }
    return clauses;
  }

  private resolveExpand(entity: EntityMetadata, expand: string[] | undefined): string[] {
    if (!expand || expand.length === 0) return [];
    if (expand.length > 2) {
      throw new ValidationError('At most two navigation properties can be expanded per query.');
    }
    const resolved: string[] = [];
    for (const name of expand) {
      const navigation = entity.navigationProperties.find(
        (item) => item.name.toLowerCase() === name.toLowerCase(),
      );
      if (!navigation) {
        throw new ValidationError(
          `Navigation property "${name}" does not exist on entity "${entity.entitySet}".`,
        );
      }
      if (!resolved.includes(navigation.name)) resolved.push(navigation.name);
    }
    return resolved;
  }
}
